import { NotificationStore } from '../domain/notification-store.js';
import { ingestNotification } from '../domain/notification-ingestion.js';
import { queryNotificationAggregations } from '../domain/notification-aggregation-query.js';
import { evaluateNotificationDuplicate, createNotificationFingerprint } from '../domain/notification-deduplication.js';
import { resolveNotificationSound, resolveSoundRule } from '../domain/sound-policy.js';
import { resolveGlobalSoundConfig } from '../domain/sound-config.js';
import { projectNotificationCategories } from '../domain/notification-classification.js';
import { createNotificationPresentationInput } from '../domain/notification-presentation-plan.js';
import { createPresentationSelector } from '../domain/notification-presentation-selector.js';
import { createPresentationProfile } from '../domain/notification-presentation-profile.js';
import { createSoundProfile } from '../domain/sound-profile.js';
import { getModelServiceUserCopy, normalizeModelServiceError } from '../domain/model-service-error.js';
import { filterVisibleNotificationRecords, sanitizeNotificationRecordForDisplay } from '../domain/internal-message-filter.js';

function apiError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export class NotificationApi {
  #store;
  #persistence;
  #soundPlayer;
  #soundScheduler;
  #soundProfile;
  #presentationProfile;
  #deduplicationPolicy;
  #hostSoundConfig;
  #soundConfig;
  #onSoundDiagnostic;

  constructor({
    store = new NotificationStore(),
    persistence = null,
    soundPlayer = null,
    soundScheduler = null,
    soundProfile = null,
    presentationProfile = null,
    deduplicationPolicy = {},
    config,
    soundConfig,
    globalSoundEnabled,
    onSoundDiagnostic = null
  } = {}) {
    if (!store || typeof store.add !== 'function' || typeof store.get !== 'function') {
      throw new TypeError('NotificationApi requires a compatible NotificationStore');
    }
    if (persistence !== null && (!persistence || typeof persistence.restore !== 'function'
      || typeof persistence.flush !== 'function')) {
      throw apiError(
        'NOTIFICATION_API_PERSISTENCE_INVALID',
        'NotificationApi persistence requires restore and flush functions'
      );
    }
    if (soundPlayer !== null && typeof soundPlayer !== 'function') {
      throw apiError(
        'NOTIFICATION_API_SOUND_PLAYER_INVALID',
        'NotificationApi soundPlayer must be a function or null'
      );
    }
    if (soundScheduler !== null && (!soundScheduler || typeof soundScheduler.schedule !== 'function')) {
      throw apiError(
        'NOTIFICATION_API_SOUND_SCHEDULER_INVALID',
        'NotificationApi soundScheduler must expose schedule() or be null'
      );
    }
    if (soundProfile !== null && soundProfile !== undefined) {
      try {
        this.#soundProfile = createSoundProfile(soundProfile);
      } catch (error) {
        throw apiError(
          'NOTIFICATION_API_SOUND_PROFILE_INVALID',
          error.message
        );
      }
    } else {
      this.#soundProfile = null;
    }
    try {
      this.#presentationProfile = presentationProfile === null || presentationProfile === undefined
        ? null
        : createPresentationProfile(presentationProfile);
    } catch (error) {
      throw apiError('NOTIFICATION_API_PRESENTATION_PROFILE_INVALID', error.message);
    }
    this.#store = store;
    this.#persistence = persistence;
    this.#soundPlayer = soundPlayer;
    this.#soundScheduler = soundScheduler;
    this.#deduplicationPolicy = { ...deduplicationPolicy };
    this.#hostSoundConfig = soundConfig ?? resolveGlobalSoundConfig({
      config,
      overrides: globalSoundEnabled === undefined ? {} : { globalSoundEnabled }
    });
    this.#soundConfig = this.#hostSoundConfig;
    this.#onSoundDiagnostic = typeof onSoundDiagnostic === 'function' ? onSoundDiagnostic : null;
  }

  get store() {
    return this.#store;
  }

  setSoundEnabled(enabled) {
    if (typeof enabled !== 'boolean') {
      throw apiError('NOTIFICATION_API_SOUND_CONFIG_INVALID', 'sound enabled must be a boolean');
    }
    this.#soundConfig = Object.freeze({
      enabled: this.#hostSoundConfig.enabled && enabled,
      diagnostic: this.#hostSoundConfig.diagnostic
    });
    return this.#soundConfig;
  }

  setPresentationProfile(presentationProfile) {
    try {
      this.#presentationProfile = presentationProfile === null || presentationProfile === undefined
        ? null
        : createPresentationProfile(presentationProfile);
      return this.#presentationProfile;
    } catch (error) {
      throw apiError('NOTIFICATION_API_PRESENTATION_PROFILE_INVALID', error.message);
    }
  }

  setSoundProfile(soundProfile) {
    try {
      this.#soundProfile = soundProfile === null || soundProfile === undefined
        ? null
        : createSoundProfile(soundProfile);
    } catch (error) {
      throw apiError('NOTIFICATION_API_SOUND_PROFILE_INVALID', error.message);
    }
    return this.#soundProfile;
  }

  async restoreNotifications() {
    return this.#persistence ? this.#persistence.restore() : null;
  }

  async flushNotifications() {
    return this.#persistence ? this.#persistence.flush() : null;
  }

  createNotification(input = {}) {
    return this.#store.add(input);
  }

  ingestModelServiceError(input = {}) {
    const error = normalizeModelServiceError(input);
    const copy = getModelServiceUserCopy(error);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const history = typeof this.#store.getSnapshotRecords === 'function'
      ? this.#store.getSnapshotRecords()
      : [];
    const previous = [...history]
      .filter((record) => record.metadata?.incidentKey === error.incidentKey)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    const previousLifecycle = previous?.metadata?.incidentLifecycle;
    const cycle = Number.isInteger(previousLifecycle?.cycle) && previousLifecycle.cycle >= 1
      ? previousLifecycle.cycle + (previousLifecycle.status === 'recovered' ? 1 : 0)
      : 1;
    const incidentCycleKey = `${error.incidentKey}|cycle:${cycle}`;
    const attemptCount = previousLifecycle?.status === 'active'
      ? Math.max(1, Number(previousLifecycle.attemptCount) || 0) + 1
      : 1;
    const eventId = typeof input.eventId === 'string' && input.eventId.trim()
      ? input.eventId.trim()
      : `${incidentCycleKey}|attempt:${error.attempt ?? attemptCount}`;
    const lifecycle = {
      key: error.incidentKey,
      cycle,
      status: 'active',
      firstSeenAt: previousLifecycle?.status === 'active' ? previousLifecycle.firstSeenAt : createdAt,
      lastSeenAt: createdAt,
      attemptCount
    };
    const modelService = { ...error, attempt: error.attempt ?? attemptCount };
    return this.ingestEvent({
      event: {
        eventId,
        traceId: incidentCycleKey,
        type: 'model_service_error',
        source: 'hana.model'
      },
      notification: {
        notificationId: input.notificationId,
        traceId: incidentCycleKey,
        createdAt,
        session: input.sessionId ?? input.taskKey ?? null,
        type: 'model_service_error',
        source: 'hana.model',
        title: copy.title,
        content: copy.content,
        importance: input.importance ?? 'high',
        metadata: {
          modelService,
          operation: error.operation,
          incidentKey: error.incidentKey,
          incidentCycleKey,
          incidentLifecycle: lifecycle,
          ...(error.taskKey ? { taskKey: error.taskKey } : {})
        }
      },
      profiles: input.profiles,
      profileId: input.profileId,
      contentPolicy: input.contentPolicy,
      beforeCreate: ({ recordInput, deduplication }) => {
        if (deduplication?.decision !== 'duplicate') return null;
        if (!previous || previous.notificationId !== recordInput.notificationId && previous.metadata?.incidentCycleKey !== incidentCycleKey) return null;
        const existingRecord = this.#store.update(previous.notificationId, {
          ...recordInput,
          notificationId: previous.notificationId,
          traceId: previous.traceId,
          createdAt: previous.createdAt,
          updatedAt: createdAt
        });
        return { existingRecord };
      }
    });
  }

  ingestModelServiceRecovered(input = {}) {
    const error = normalizeModelServiceError(input);
    const recoveredAt = input.recoveredAt ?? new Date().toISOString();
    const history = typeof this.#store.getSnapshotRecords === 'function'
      ? this.#store.getSnapshotRecords()
      : [];
    const active = [...history]
      .filter((record) => record.metadata?.incidentKey === error.incidentKey
        && record.metadata?.incidentLifecycle?.status === 'active')
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    if (!active) {
      return Object.freeze({ handled: true, recovered: false, incidentKey: error.incidentKey, record: null });
    }
    const lifecycle = active.metadata.incidentLifecycle;
    const record = this.#store.update(active.notificationId, {
      updatedAt: recoveredAt,
      metadata: {
        ...active.metadata,
        incidentLifecycle: {
          ...lifecycle,
          status: 'recovered',
          lastSeenAt: recoveredAt,
          recoveredAt
        },
        modelServiceRecovery: {
          recovered: true,
          recoveredAt,
          reason: error.reason
        }
      }
    });
    return Object.freeze({ handled: true, recovered: true, incidentKey: error.incidentKey, record });
  }

  ingestEvent({
    event,
    notification,
    profiles,
    profileId = 'default',
    contentPolicy,
    presentationProfile = this.#presentationProfile,
    soundEnabled = true,
    beforeCreate = null
  } = {}) {
    let history = [];
    let historyUnavailable = false;
    if (typeof this.#store.getSnapshotRecords === 'function') {
      try {
        history = this.#store.getSnapshotRecords();
      } catch {
        historyUnavailable = true;
      }
    }
    let deduplication = null;
    const result = ingestNotification({
      api: this,
      event,
      notification,
      profiles,
      profileId,
      contentPolicy,
      presentationProfile,
      beforeCreate: (context) => {
        deduplication = historyUnavailable
          ? Object.freeze({
            decision: 'indeterminate',
            suppress: false,
            reason: 'deduplication-history-unavailable',
            diagnostic: 'NOTIFICATION_DEDUPLICATION_FAILED'
          })
          : this.#evaluateDeduplication(context.recordInput, history);
        const custom = typeof beforeCreate === 'function'
          ? beforeCreate({ ...context, deduplication })
          : null;
        return {
          deduplication,
          ...(custom && typeof custom === 'object' ? custom : {})
        };
      }
    });
    return {
      ...result,
      deduplication,
      sound: this.#prepareSound({ ...result, deduplication, soundEnabled })
    };
  }

  #evaluateDeduplication(recordInput, history) {
    try {
      const fingerprint = createNotificationFingerprint(recordInput, this.#deduplicationPolicy);
      const previous = fingerprint.key === null
        ? undefined
        : [...history]
          .filter((record) => createNotificationFingerprint(record, this.#deduplicationPolicy).key === fingerprint.key)
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
      const result = evaluateNotificationDuplicate({
        notification: recordInput,
        previous,
        policy: this.#deduplicationPolicy
      });
      return Object.freeze({ ...result, diagnostic: null });
    } catch {
      return Object.freeze({
        decision: 'indeterminate',
        suppress: false,
        reason: 'deduplication-failed',
        diagnostic: 'NOTIFICATION_DEDUPLICATION_FAILED'
      });
    }
  }

  #emitSoundDiagnostic(payload) {
    try {
      this.#onSoundDiagnostic?.(payload);
    } catch {
      // Diagnostics are observational and must never affect notification ingestion.
    }
  }

  #prepareSound({ record, profile, classification, canonicalEvent, deduplication, soundEnabled = true }) {
    const usesSoundProfile = this.#soundProfile !== null;
    let decision;
    let presentation = null;

    if (usesSoundProfile) {
      const projectedClassification = projectNotificationCategories(record);
      presentation = createNotificationPresentationInput(record, projectedClassification, this.#presentationProfile);
      if (this.#presentationProfile !== null) {
        try {
          const selector = createPresentationSelector({ record, canonicalEvent, classification: projectedClassification, profile: this.#presentationProfile });
          presentation = Object.freeze({
            ...presentation,
            selector,
            soundInput: Object.freeze({
              ...presentation.soundInput,
              eventId: selector.eventId,
              categoryId: selector.categoryId,
              eventTypeId: selector.eventTypeId,
              soundProfileId: selector.sound.soundProfileId
            })
          });
        } catch {
          // Legacy records remain playable through the compatibility presentation input.
        }
      }
      // The runtime notification path may not provide a presentation profile. Once
      // ingestion has established a canonical event, it is still the only valid
      // identity for sound resolution; never fall back to record.type here.
      if (canonicalEvent?.eventId && presentation?.soundInput) {
        presentation = Object.freeze({
          ...presentation,
          soundInput: Object.freeze({
            ...presentation.soundInput,
            eventId: canonicalEvent.eventId,
            categoryId: canonicalEvent.categoryId,
            eventTypeId: canonicalEvent.eventTypeId,
            ...(presentation.soundInput.soundProfileId ? { soundProfileId: presentation.soundInput.soundProfileId } : {})
          })
        });
      }
      decision = resolveSoundRule({
        presentation,
        profile: this.#soundProfile,
        context: {
          isDuplicate: Boolean(deduplication?.suppress),
          globalEnabled: this.#soundConfig.enabled
        }
      });
    } else {
      decision = resolveNotificationSound({
        notification: record,
        policy: profile.profile.soundPolicy,
        context: {
          isDuplicate: Boolean(deduplication?.suppress && profile.profile.soundPolicy.suppressDuplicates),
          globalEnabled: this.#soundConfig.enabled
        }
      });
    }

    const soundInput = presentation?.soundInput ?? Object.freeze({
      labels: Object.freeze([]),
      event: record?.type ?? null,
      importance: record?.importance ?? null,
      producer: null,
      source: record?.source ?? null,
      channel: record?.channel ?? null,
      stableKey: record?.notificationId ?? null
    });
    if (!soundEnabled) {
      const disabledDecision = Object.freeze({ ...decision, play: false, reason: 'test-sound-disabled' });
      return Object.freeze({
        decision: disabledDecision,
        scheduled: false,
        playback: null,
        global: this.#soundConfig,
        ...(usesSoundProfile ? { matchedRuleId: decision.matchedRuleId, presentation } : {})
      });
    }
    if (!this.#soundPlayer && !this.#soundScheduler) {
      const noPlayerDecision = decision.play
        ? Object.freeze({ ...decision, play: false, reason: 'no-player' })
        : decision;
      this.#emitSoundDiagnostic({ source: 'notification', input: soundInput, decision: noPlayerDecision, scheduling: { status: 'skipped', reason: noPlayerDecision.reason } });
      return Object.freeze({
        decision: noPlayerDecision,
        scheduled: false,
        playback: null,
        global: this.#soundConfig,
        ...(usesSoundProfile ? { matchedRuleId: decision.matchedRuleId, presentation } : {})
      });
    }
    if (!decision.play) {
      this.#emitSoundDiagnostic({ source: 'notification', input: soundInput, decision, scheduling: { status: 'skipped', reason: decision.reason } });
      return Object.freeze({
        decision,
        scheduled: false,
        playback: null,
        global: this.#soundConfig,
        ...(usesSoundProfile ? { matchedRuleId: decision.matchedRuleId, presentation } : {})
      });
    }

    const context = {
      stableKey: deduplication?.key ?? record.notificationId,
      record,
      profile,
      presentation
    };
    const schedulerFailure = (error, reason = 'scheduler-rejected') => Object.freeze({
      status: 'failed',
      soundKey: decision.soundId ?? decision.cue ?? null,
      suppressDuplicates: decision.suppressDuplicates !== false,
      diagnostic: error?.code ?? 'SOUND_SCHEDULER_FAILED',
      error: error instanceof Error ? error.message : String(error ?? 'sound scheduler failed'),
      playback: Object.freeze({
        attempted: false,
        played: false,
        source: 'none',
        cue: decision.cue ?? null,
        path: '',
        volume: decision.volume,
        reason,
        diagnostic: error?.code ?? 'SOUND_SCHEDULER_FAILED'
      })
    });
    let playback;
    if (this.#soundScheduler) {
      try {
        playback = Promise.resolve(this.#soundScheduler.schedule(decision, context))
          .catch((error) => schedulerFailure(error));
      } catch (error) {
        playback = Promise.resolve(schedulerFailure(error, 'scheduler-failed'));
      }
    } else {
      playback = Promise.resolve()
        .then(() => this.#soundPlayer({ decision, record, profile, presentation }))
        .catch(() => Object.freeze({
          attempted: true,
          played: false,
          source: 'none',
          cue: decision.cue,
          path: '',
          volume: decision.volume,
          reason: 'playback-failed',
          diagnostic: 'SOUND_PLAYBACK_FAILED'
        }));
    }
    playback.then((scheduling) => {
      this.#emitSoundDiagnostic({
        source: 'notification',
        input: soundInput,
        decision,
        scheduling: scheduling && typeof scheduling === 'object' ? scheduling : { status: 'unavailable' },
        playback: scheduling?.playback ?? null
      });
    });
    return Object.freeze({
      decision,
      scheduled: true,
      playback,
      global: this.#soundConfig,
      ...(usesSoundProfile ? { matchedRuleId: decision.matchedRuleId, presentation } : {})
    });
  }

  getNotification(notificationId) {
    return sanitizeNotificationRecordForDisplay(this.#store.get(notificationId));
  }

  listNotifications(options = {}) {
    const { limit, ...filterOptions } = options ?? {};
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw apiError('NOTIFICATION_API_LIMIT_INVALID', 'limit must be a non-negative integer');
    }
    const visible = filterVisibleNotificationRecords(this.#store.list(filterOptions));
    return limit === undefined ? visible : visible.slice(0, limit);
  }

  listNotificationAggregations({
    groupingPolicy = {},
    deduplicationPolicy = {},
    aggregationPolicy = {},
    includeDuplicates = false,
    filter = {},
    sort = {},
    offset = 0,
    limit = 50
  } = {}) {
    if (typeof this.#store.getSnapshotRecords !== 'function') {
      throw apiError(
        'NOTIFICATION_API_AGGREGATION_SOURCE_INVALID',
        'NotificationApi requires a Store snapshot source for aggregation queries'
      );
    }
    return queryNotificationAggregations({
      records: filterVisibleNotificationRecords(this.#store.getSnapshotRecords()),
      groupingPolicy,
      deduplicationPolicy,
      aggregationPolicy,
      includeDuplicates,
      filter,
      sort,
      offset,
      limit
    });
  }

  updateNotification(notificationId, patch = {}) {
    return this.#store.update(notificationId, patch);
  }

  setNotificationStatus(notificationId, status, options = {}) {
    return this.#store.setStatus(notificationId, status, options);
  }

  setNotificationsStatus(notificationIds, status) {
    if (typeof this.#store.setStatuses !== 'function') {
      throw apiError(
        'NOTIFICATION_API_BATCH_STATUS_UNAVAILABLE',
        'Notification Store does not support batch status updates'
      );
    }
    return this.#store.setStatuses(notificationIds, status);
  }

  removeNotification(notificationId) {
    return this.#store.remove(notificationId);
  }

  removeNotifications(notificationIds) {
    if (typeof this.#store.removeMany !== 'function') {
      throw apiError('NOTIFICATION_API_BATCH_REMOVE_UNAVAILABLE', 'Notification Store does not support batch removal');
    }
    return this.#store.removeMany(notificationIds);
  }

  clearNotifications() {
    return this.#store.clear();
  }
}
