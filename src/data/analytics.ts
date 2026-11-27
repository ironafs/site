export const measurementId = 'G-RZM2LM714L';
export const choiceKey = 'ironafs-analytics-choice-v1';
export const noticeKey = 'ironafs-analytics-notice-v1';
export const grantDays = 180;
export const cookieDays = 30;
export const cookiePrefix = 'ironafs';
export const legacyCookieNames = ['_ga', `_ga_${measurementId.slice(2)}`];
export const analyticsCookieNames = legacyCookieNames.map(name => `${cookiePrefix}${name}`);
