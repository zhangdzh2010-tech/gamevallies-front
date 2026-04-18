import Taro from '@tarojs/taro';

const DEFAULT_TOAST_DURATION = 2000;

function pickMessage(error, fallback) {
  if (!error) return fallback || '';
  if (typeof error === 'string') return error || fallback || '';
  if (typeof error === 'object') {
    return (
      error.userMessage ||
      error.message ||
      error.errMsg ||
      error.msg ||
      fallback ||
      ''
    );
  }

  return fallback || '';
}

/**
 * Show a short toast message (non-blocking). Prefer for minor feedback such as
 * optimistic action completions or transient warnings.
 */
export function toastInfo(message, options = {}) {
  const title = typeof message === 'string' ? message : pickMessage(message, '');
  if (!title) return;

  Taro.showToast({
    title,
    icon: options.icon || 'none',
    duration: options.duration || DEFAULT_TOAST_DURATION,
    mask: options.mask || false,
  });
}

/**
 * Show a short error toast. Accepts either a string or an Error-like object and
 * falls back to a user-friendly default.
 */
export function toastError(error, fallback = '操作失败，请稍后再试', options = {}) {
  const title = pickMessage(error, fallback);
  if (!title) return;

  Taro.showToast({
    title,
    icon: options.icon || 'none',
    duration: options.duration || DEFAULT_TOAST_DURATION,
    mask: options.mask || false,
  });
}

/**
 * Show a blocking error modal for critical failures that require acknowledgement
 * (e.g. payment failures, irreversible state issues). Returns a Promise resolving
 * with the modal result.
 */
export function modalError(error, fallback = '出现了一些问题', options = {}) {
  const content = pickMessage(error, fallback);

  return Taro.showModal({
    title: options.title || '提示',
    content: content || fallback,
    showCancel: options.showCancel !== false,
    confirmText: options.confirmText || '知道了',
    cancelText: options.cancelText || '取消',
    confirmColor: options.confirmColor,
    cancelColor: options.cancelColor,
  }).catch(() => null);
}

/**
 * Show a success toast. Thin wrapper around Taro.showToast to keep call sites
 * consistent.
 */
export function toastSuccess(message, options = {}) {
  const title = typeof message === 'string' ? message : pickMessage(message, '');
  if (!title) return;

  Taro.showToast({
    title,
    icon: options.icon || 'success',
    duration: options.duration || DEFAULT_TOAST_DURATION,
    mask: options.mask || false,
  });
}

export default {
  toastInfo,
  toastError,
  toastSuccess,
  modalError,
};
