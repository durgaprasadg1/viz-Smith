export function updateFormField(setFormData, event) {
  const { name, value } = event.target;
  setFormData((current) => ({ ...current, [name]: value }));
}

export function getErrorMessage(error, fallback) {
  return error?.message ?? fallback;
}

