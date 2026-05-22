export type CapabilityStatus = 'supported' | 'unsupported';

export function reconcileMethodSupportLists<K extends string>(params: {
  supportedMethods: K[];
  unsupportedMethods: K[];
  method: K;
  status: CapabilityStatus;
}) {
  const { supportedMethods, unsupportedMethods, method, status } = params;

  return {
    supportedMethods:
      status === 'supported'
        ? supportedMethods.includes(method)
          ? supportedMethods
          : [...supportedMethods, method]
        : supportedMethods.includes(method)
          ? supportedMethods.filter((entry) => entry !== method)
          : supportedMethods,
    unsupportedMethods:
      status === 'unsupported'
        ? unsupportedMethods.includes(method)
          ? unsupportedMethods
          : [...unsupportedMethods, method]
        : unsupportedMethods.includes(method)
          ? unsupportedMethods.filter((entry) => entry !== method)
          : unsupportedMethods,
  };
}
