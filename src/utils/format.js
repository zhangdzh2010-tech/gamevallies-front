export const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return String(num);
};

export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * Math.pow(10, dm)) / Math.pow(10, dm) + ' ' + sizes[i];
};

export const formatCurrency = (amount, currency = 'CNY') => {
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency
  });
  return formatter.format(amount);
};

export const formatPercent = (value, decimals = 0) => {
  return `${(value * 100).toFixed(decimals)}%`;
};

export const capitalizeFirstLetter = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const capitalize = (str) => {
  return str.
  split(' ').
  map((word) => word.charAt(0).toUpperCase() + word.slice(1)).
  join(' ');
};

export const truncate = (str, length, suffix = '...') => {
  if (str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};