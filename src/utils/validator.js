/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (supports multiple formats)
 * China: 11 digits starting with 1
 * International: various formats
 */
export function isValidPhone(phone) {
  // China phone number
  const chinaPhoneRegex = /^1[3-9]\d{9}$/;
  if (chinaPhoneRegex.test(phone)) return true;

  // International phone number (basic)
  const intlPhoneRegex = /^\+?[1-9]\d{1,14}$/;
  return intlPhoneRegex.test(phone);
}

/**
 * Validate username
 * - 3-20 characters
 * - alphanumeric, underscore, hyphen allowed
 * - must start with letter or number
 */
export function isValidUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}$/;
  return usernameRegex.test(username);
}

/**
 * Validate password strength
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * Optional: at least one special character
 */
export function isValidPassword(password, requireSpecial = false) {
  // At least 8 characters
  if (password.length < 8) return false;

  // At least one uppercase and one lowercase
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) return false;

  // At least one number
  if (!/\d/.test(password)) return false;

  // Special character (optional)
  if (requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return false;
  }

  return true;
}

/**
 * Check password strength
 * Returns: 'weak' | 'medium' | 'strong'
 */
export function getPasswordStrength(password) {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;

  if (strength <= 2) return 'weak';
  if (strength <= 3) return 'medium';
  return 'strong';
}

/**
 * Validate URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate game title
 * - 1-100 characters
 * - no special characters except space, hyphen, apostrophe
 */
export function isValidGameTitle(title) {
  if (!title || title.length === 0 || title.length > 100) return false;
  const titleRegex = /^[a-zA-Z0-9\u4e00-\u9fa5\s\-']+$/;
  return titleRegex.test(title);
}

/**
 * Validate game description
 * - 10-1000 characters
 */
export function isValidGameDescription(description) {
  if (!description || description.length < 10 || description.length > 1000) return false;
  return true;
}

/**
 * Validate tag
 * - 1-20 characters
 * - alphanumeric only
 */
export function isValidTag(tag) {
  const tagRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,20}$/;
  return tagRegex.test(tag);
}

/**
 * Validate hex color
 */
export function isValidHexColor(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Batch validation helper
 */
export const validate = {
  email: isValidEmail,
  phone: isValidPhone,
  username: isValidUsername,
  password: isValidPassword,
  url: isValidUrl,
  gameTitle: isValidGameTitle,
  gameDescription: isValidGameDescription,
  tag: isValidTag,
  hexColor: isValidHexColor
};