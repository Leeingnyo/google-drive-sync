export function mergeLastWriteWins(localValue, remoteValue) {
  if (localValue === undefined) {
    return remoteValue;
  }
  if (remoteValue === undefined) {
    return localValue;
  }
  const localUpdatedAt = getUpdatedAt(localValue);
  const remoteUpdatedAt = getUpdatedAt(remoteValue);
  if (localUpdatedAt !== undefined && remoteUpdatedAt !== undefined) {
    return localUpdatedAt >= remoteUpdatedAt ? localValue : remoteValue;
  }
  return localValue;
}

export function mergeDeep(localValue, remoteValue) {
  if (localValue === undefined) {
    return remoteValue;
  }
  if (remoteValue === undefined) {
    return localValue;
  }
  if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
    return deepMerge(remoteValue, localValue);
  }
  return localValue;
}

export function mergeByConfirm(localValue, remoteValue, key) {
  if (localValue === undefined) {
    return remoteValue;
  }
  if (remoteValue === undefined) {
    return localValue;
  }
  const message = [
    `Conflict on "${key}".`,
    '',
    'Local:',
    safeStringify(localValue),
    '',
    'Remote:',
    safeStringify(remoteValue),
    '',
    'OK = use remote, Cancel = use local.',
  ].join('\n');
  return window.confirm(message) ? remoteValue : localValue;
}

export function getUpdatedAt(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidates = [
    value.updatedAt,
    value.updated_at,
    value.modifiedAt,
    value.modified_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(baseValue, overrideValue) {
  const result = { ...baseValue };
  for (const [key, overrideItem] of Object.entries(overrideValue)) {
    const baseItem = baseValue?.[key];
    if (isPlainObject(overrideItem) && isPlainObject(baseItem)) {
      result[key] = deepMerge(baseItem, overrideItem);
    } else {
      result[key] = overrideItem;
    }
  }
  return result;
}

export function safeStringify(value, maxLength = 2000) {
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch (error) {
    text = String(value);
  }
  if (text === undefined) {
    text = String(value);
  }
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }
  return text;
}
