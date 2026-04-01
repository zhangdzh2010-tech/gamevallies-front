export function getInputEventValue(event) {
  const detailValue = event?.detail?.value;
  if (detailValue !== undefined && detailValue !== null) {
    return String(detailValue);
  }

  const targetValue = event?.target?.value;
  if (targetValue !== undefined && targetValue !== null) {
    return String(targetValue);
  }

  const currentTargetValue = event?.currentTarget?.value;
  if (currentTargetValue !== undefined && currentTargetValue !== null) {
    return String(currentTargetValue);
  }

  return '';
}
