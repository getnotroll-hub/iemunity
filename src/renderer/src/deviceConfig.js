// Device PEQ registry - condensed from hangout.audio devicePEQ plugin (Pragmatic Audio)

export const PEQ_CONSTRAINTS = {
  peq5Band12dBFullShelves: { minGain: -12, maxGain: 12, maxFilters: 5, supportsLS: true, supportsHS: true },
  peq10Band12dBFullShelves: { minGain: -12, maxGain: 12, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq10Band12dBWideAllFilters: { minGain: -24, maxGain: 12, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq10Band12dBAllFilters7: { minGain: -12, maxGain: 12, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq31Band12dBWideShelves: { minGain: -12, maxGain: 12, maxFilters: 31, supportsLS: true, supportsHS: true },
  peq10Band12dBAllFiltersNoPregain: { minGain: -12, maxGain: 12, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq10Band20dBFullShelves: { minGain: -20, maxGain: 20, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq12Band15dBFullShelves: { minGain: -15, maxGain: 15, maxFilters: 12, supportsLS: true, supportsHS: true },
  peq8Band12dBFullShelves: { minGain: -12, maxGain: 12, maxFilters: 8, supportsLS: true, supportsHS: true },
  peq4Band6dBPkOnlyNoPregain: { minGain: -6, maxGain: 6, maxFilters: 4 },
  peq10Band12dBPkOnlyNoPregain: { minGain: -12, maxGain: 12, maxFilters: 10 },
  peq5Band12dBFullShelvesNoPregain: { minGain: -12, maxGain: 12, maxFilters: 5, supportsLS: true, supportsHS: true },
  walkplayPeq8Band10dBPkOnly: { minGain: -10, maxGain: 10, maxFilters: 8 },
  walkplayPeq8Band10dBLsLowpass: { minGain: -10, maxGain: 10, maxFilters: 8, supportsLS: true },
  walkplayPeq8Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 8, supportsLS: true, supportsHS: true },
  walkplayPeq10Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 10, supportsLS: true, supportsHS: true },
  walkplayPeq5Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 5, supportsLS: true, supportsHS: true },
  walkplayPeq6Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 6, supportsLS: true, supportsHS: true },
  walkplayPeq10Band10dBPkOnly: { minGain: -10, maxGain: 10, maxFilters: 10 },
  peq10Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 10, supportsLS: true, supportsHS: true },
  peq8Band10dBFullShelves: { minGain: -10, maxGain: 10, maxFilters: 8, supportsLS: true, supportsHS: true },
  peq8Band12dBFullShelves: { minGain: -12, maxGain: 12, maxFilters: 8, supportsLS: true, supportsHS: true }
}

export function resolveConstraints(modelConfig) {
  if (!modelConfig) return null
  const ref = modelConfig.peqConstraintsRef
  if (ref && PEQ_CONSTRAINTS[ref]) return { ...PEQ_CONSTRAINTS[ref] }
  return {
    minGain: modelConfig.minGain ?? -12,
    maxGain: modelConfig.maxGain ?? 12,
    maxFilters: modelConfig.maxFilters ?? 10,
    supportsLS: modelConfig.supportsLS ?? true,
    supportsHS: modelConfig.supportsHS ?? true
  }
}

export const HID_DEVICE_CONFIG = [
  {
    vendorIds: [0x2972, 0x0a12],
    manufacturer: 'FiiO',
    handler: 'fiio',
    defaultModelConfig: {
      peqConstraintsRef: 'peq5Band12dBFullShelves',
      firstWritableEQSlot: -1,
      maxWritableEQSlots: 0,
      disconnectOnSave: true,
      disabledPresetId: -1,
      reportId: 7
    },
    devices: {
      'Protocol Max': { manufacturer: 'CrinEar', peqConstraintsRef: 'peq10Band10dBFullShelves', schemeNo: 16, deviceHandlesPregain: true, maxFilters: 10, availableSlots: [{ id: 101, name: 'Custom' }] },
      'CrinEar Protocol Max': { manufacturer: 'CrinEar', peqConstraintsRef: 'peq10Band10dBFullShelves', schemeNo: 16, deviceHandlesPregain: true, maxFilters: 10, availableSlots: [{ id: 101, name: 'Custom' }] },
      'Protocol Max by CrinEar': { manufacturer: 'CrinEar', peqConstraintsRef: 'peq10Band10dBFullShelves', schemeNo: 16, deviceHandlesPregain: true, maxFilters: 10, availableSlots: [{ id: 101, name: 'Custom' }] },
      'Moondrop Chu II DSP': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 13 },
      'Moondrop Quark2 DSP': { peqConstraintsRef: 'walkplayPeq8Band10dBPkOnly', schemeNo: 10 },
      'Tanchjim Stargate II': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 16 },
      'Tanchjim Space Pro': { peqConstraintsRef: 'walkplayPeq8Band10dBFullShelves', schemeNo: 15 },
      'Tanchjim One DSP': { peqConstraintsRef: 'walkplayPeq5Band10dBFullShelves', schemeNo: 17 },
      'Tanchjim Bunny DSP': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 13 },
      'KiwiEars Allegro': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 18 },
      'KiwiEars Allegro Pro': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 18 },
      'KiwiEars Chorus': { peqConstraintsRef: 'walkplayPeq5Band10dBFullShelves', schemeNo: 17 },
      'JCally JM98 Max': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 13 },
      'ddHiFi DSP Cable': { peqConstraintsRef: 'walkplayPeq8Band10dBPkOnly', schemeNo: 10 },
      'Nicehck Octave': { peqConstraintsRef: 'walkplayPeq8Band10dBFullShelves', schemeNo: 15 },
      'TRUTHEAR KEYX': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 16 },
      'EPZ TP13': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 13 },
      'ddHiFi DSP IEM - Memory': { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 16 },
      'CS43131 HiFi Audio DSP': { peqConstraintsRef: 'walkplayPeq8Band10dBLsLowpass', schemeNo: 11 },
      'CS43198 HiFi DSP Audio': { peqConstraintsRef: 'walkplayPeq8Band10dBLsLowpass', schemeNo: 11 },
      'JadeAudio JA11': { peqConstraintsRef: 'peq5Band12dBFullShelves', firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 4, reportId: 2, availableSlots: [{ id: 0, name: 'Vocal' }, { id: 1, name: 'Classic' }, { id: 2, name: 'Bass' }, { id: 3, name: 'USER1' }] },
      'FIIO KA15': { peqConstraintsRef: 'peq10Band12dBAllFilters7', firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 10, reportId: 1 },
      'FIIO KA17': { peqConstraintsRef: 'peq10Band12dBAllFilters7', firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 10, reportId: 1 },
      'FIIO KA17 (MQA HID)': { peqConstraintsRef: 'peq10Band12dBAllFilters7', firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 10, reportId: 1 },
      'FIIO K17': { peqConstraintsRef: 'peq31Band12dBWideShelves', firstWritableEQSlot: 7, maxWritableEQSlots: 10, disconnectOnSave: false, disabledPresetId: 17, saveCommandId: 0x21, reportId: 7 },
      'FIIO BTR13': { peqConstraintsRef: 'peq10Band12dBAllFilters7', firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, reportId: 7 },
      'FIIO QX13': { peqConstraintsRef: 'peq10Band12dBWideAllFilters', firstWritableEQSlot: 160, maxWritableEQSlots: 10, disconnectOnSave: false, disabledPresetId: 240, reportId: 7 }
    }
  },
  {
    vendorIds: [0x0104, 0x011b, 0x011d, 0x0661, 0x0663, 0x0666, 0x0762, 0x0d8c, 0x2fc6, 0x3302, 0x34be, 0x35d8, 0x36a7, 0x373b, 0x60c1, 0x60e1, 0xb445, 0xb44d],
    manufacturer: 'WalkPlay DSP',
    handler: 'walkplay',
    defaultModelConfig: {
      peqConstraintsRef: 'walkplayPeq8Band10dBPkOnly',
      schemeNo: 10,
      firstWritableEQSlot: 101,
      maxWritableEQSlots: 1,
      disconnectOnSave: false,
      reportId: 0
    },
    devices: {},
    deviceGroups: {
      SchemeNo11: { productIds: [0x0004, 0x00c0, 0x0104, 0x0880, 0x1230, 0x1231, 0x1233, 0x1237, 0x123f, 0x1240, 0x1241, 0x1243, 0x1244, 0x1245, 0x1248, 0x1249, 0x124a, 0x124b, 0x124c, 0x124d, 0x124e, 0x1251, 0x1261, 0x1262, 0x1264, 0x1266, 0x1269, 0x126a, 0x126b, 0x126c, 0x126d, 0x126e, 0x126f, 0x1272, 0x1278, 0x127a, 0x127d, 0x127e, 0x1281, 0x1282, 0x1283, 0x1284, 0x1285, 0x1286, 0x1287, 0x1288, 0x1289, 0x128a, 0x128b, 0x128c, 0x128d, 0x128e, 0x128f, 0x1292, 0x1293, 0x1294, 0x1295, 0x1296, 0x1297, 0x1298, 0x1299, 0x129a, 0x129b, 0x129c, 0x129d, 0x129f, 0x12b3, 0x12c0, 0x12c1, 0x12c3, 0x12c4, 0x12c5, 0x12c6, 0x12c8, 0x12c9, 0x12ca, 0x12cb, 0x12cc, 0x12cd, 0x12ce, 0x12db, 0x12e9, 0x132b, 0x13a3, 0x13a4, 0x13a5, 0x13ab, 0x13c0, 0x13c1, 0x13d3, 0x13d4, 0x13d7, 0x13d9, 0x13dc, 0x3302, 0x4302, 0x43c1, 0x43c3, 0x43d1, 0x43d5, 0x43dc, 0x43e7, 0x51c0, 0x60d2, 0x9121, 0x9123, 0x9124, 0x9125, 0x93c0, 0x93c1, 0x93d1, 0x98c0, 0x98c1, 0x98c2, 0x98d1, 0x98d2, 0x98d5, 0xa862, 0xc204, 0xc207, 0xc208, 0xc209, 0xc20a, 0xc20e, 0xc20f, 0xc211, 0xc212, 0xc213, 0xc214, 0xc215, 0xc217, 0xf806, 0xf807, 0xff01], modelConfig: { peqConstraintsRef: 'walkplayPeq8Band10dBLsLowpass' } },
      SchemeNo16: { productIds: [0x011d, 0x4301, 0x4302, 0x4304, 0x4305, 0x4306, 0x430d, 0x430e, 0x430f, 0x4312, 0x4313, 0x4316, 0x4319, 0x4351, 0x4352, 0x4355, 0x4358, 0x4359, 0x435a, 0x435c, 0x435d, 0x435e, 0x4360, 0x4361, 0x4363, 0x4364, 0x4366, 0x4367, 0x4380, 0x4381, 0x4382, 0x4383, 0x4386, 0x43b1, 0x43b6, 0x43b7, 0x43b8, 0x43bc, 0x43be, 0x43bf, 0x43c0, 0x43c2, 0x43c5, 0x43c6, 0x43c7, 0x43c8, 0x43c9, 0x43ca, 0x43cc, 0x43cd, 0x43cf, 0x43d7, 0x43d8, 0x43da, 0x43db, 0x43de, 0x43e1, 0x43e4, 0x43e6, 0x43e8, 0x43ec, 0x43ef, 0x98d4, 0xee10, 0xee20, 0xf808], modelConfig: { peqConstraintsRef: 'peq10Band10dBFullShelves', schemeNo: 16 } },
      SchemeNo15: { productIds: [0x012a, 0x35d8, 0x39c1, 0x4353, 0x4357, 0x4362, 0x4370, 0x43cb, 0x43d6, 0x43d9, 0x43df, 0x43e2, 0x43e3, 0x43ea, 0x43eb], modelConfig: { peqConstraintsRef: 'walkplayPeq8Band10dBFullShelves', schemeNo: 15 } },
      SchemeNo13: { productIds: [0x011b, 0x0123, 0x120c, 0x1320, 0x1321, 0x1326, 0x1327, 0x1328, 0x1329, 0x132a, 0x1333, 0x13a9, 0x13ac, 0x13ae, 0x13af, 0x13b0, 0x13b1, 0x13b2, 0x13b4, 0x13b6, 0x13b9, 0x13ba, 0x13bb, 0x13be, 0x13bf, 0x13df, 0x23c0, 0x23c1, 0x60c0, 0x60c1, 0x60c3, 0x60d1, 0x60e1], modelConfig: { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 13 } },
      SchemeNo17: { productIds: [0x2010, 0x201d, 0x201e, 0x2030, 0x2036, 0x2038, 0x203a, 0x20e1, 0x20e2, 0x20e3, 0x20e5, 0x20e7, 0x20e8, 0x20ea, 0x20ec, 0x20ee, 0x20ef, 0x20ff, 0x2dc1], modelConfig: { peqConstraintsRef: 'walkplayPeq5Band10dBFullShelves', schemeNo: 17 } },
      SchemeNo18: { productIds: [0x39c2, 0x39c3, 0x39c4, 0x39c6, 0x39c7, 0x39c9, 0x39cd, 0x44d1, 0x44d2, 0x44d3, 0x44d6], modelConfig: { peqConstraintsRef: 'walkplayPeq10Band10dBFullShelves', schemeNo: 18 } },
      SchemeNo10: { productIds: [0x0881, 0x0888], modelConfig: { peqConstraintsRef: 'walkplayPeq8Band10dBPkOnly', schemeNo: 10 } },
      SchemeNo19: { productIds: [0x231e, 0x231f, 0x2320, 0x2323, 0x23e2, 0x23ee], modelConfig: { peqConstraintsRef: 'walkplayPeq6Band10dBFullShelves', schemeNo: 19 } },
      SchemeNo20: { productIds: [0x0883, 0x1323, 0x13b7], modelConfig: { peqConstraintsRef: 'walkplayPeq10Band10dBPkOnly', schemeNo: 20 } },
      SchemeNo21: { productIds: [0x0880, 0x08f2, 0x13f2, 0x3dc1, 0x3dc4, 0x3dc5, 0x3dc6, 0x3dc7], modelConfig: { peqConstraintsRef: 'walkplayPeq8Band10dBPkOnly', schemeNo: 21 } }
    }
  },
  {
    vendorIds: [0x31b2],
    manufacturer: 'KT Micro',
    handler: 'ktmicro',
    defaultModelConfig: {
      peqConstraintsRef: 'peq5Band12dBFullShelvesNoPregain',
      maxFilters: 5,
      disconnectOnSave: true,
      disabledPresetId: 0x02,
      compensate2X: true,
      reportId: 0x4b,
      availableSlots: [{ id: 0x03, name: 'Custom' }]
    },
    devices: {}
  },
  {
    vendorIds: [0x152a],
    manufacturer: 'Fosi Audio',
    handler: 'fosi',
    defaultModelConfig: {
      peqConstraintsRef: 'peq10Band12dBAllFiltersNoPregain',
      maxFilters: 10,
      firstWritableEQSlot: 7,
      maxWritableEQSlots: 5,
      disconnectOnSave: false,
      disabledPresetId: 0,
      reportId: 1
    },
    devices: {}
  },
  {
    vendorIds: [0x2972, 0x0a12, 0x3302, 0x34be],
    manufacturer: 'Moondrop',
    handler: 'moondrop',
    defaultModelConfig: {
      peqConstraintsRef: 'peq10Band10dBFullShelves',
      maxFilters: 8,
      firstWritableEQSlot: 7,
      maxWritableEQSlots: 1,
      disconnectOnSave: false,
      reportId: 0x4b,
      availableSlots: [{ id: 7, name: 'Custom' }]
    },
    devices: {
      Rays: { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'AG Rays': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      Marigold: { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'MOONDROP Marigold': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'FreeDSP Pro': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'FreeDSP Mini': { peqConstraintsRef: 'peq8Band10dBFullShelves', maxFilters: 8 },
      'MOONRIVER 3': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'DAWN PRO2': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'Echo A': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      DHA15: { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'Deco Audio System': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'INN Deco75-DH Audio': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'ddHiFi DSP IEM - Memory': { peqConstraintsRef: 'peq10Band10dBFullShelves' },
      'Old Fashioned': { handler: 'moondrop-old', peqConstraintsRef: 'peq8Band12dBFullShelves', maxFilters: 8 }
    }
  }
]

export const SERIAL_DEVICE_CONFIG = [
  {
    vendorId: 0x152a,
    manufacturer: 'JDS Labs',
    handler: 'jdslabs',
    devices: {
      'Element IV': { usbProductId: 35066, baudRate: 115200, peqConstraintsRef: 'peq10Band12dBFullShelves', firstWritableEQSlot: 0, maxWritableEQSlots: 1, availableSlots: [{ id: 0, name: 'Headphones' }, { id: 1, name: 'RCA' }] }
    }
  },
  {
    vendorId: 6790,
    manufacturer: 'FiiO',
    handler: 'fiio-serial',
    devices: {
      'FiiO Audio DSP': { usbProductId: 21971, baudRate: 57600, peqConstraintsRef: 'peq10Band12dBFullShelves', firstWritableEQSlot: 0, maxWritableEQSlots: 21, disabledPresetId: 11 }
    }
  }
]

export function matchHidDevice(vendorId, productId, productName) {
  for (const vendor of HID_DEVICE_CONFIG) {
    if (!vendor.vendorIds.includes(vendorId)) continue
    const name = productName || ''
    if (vendor.devices[name]) {
      const dev = vendor.devices[name]
      return { manufacturer: dev.manufacturer || vendor.manufacturer, handler: dev.handler || vendor.handler, model: name, modelConfig: { ...vendor.defaultModelConfig, ...dev } }
    }
    if (vendor.deviceGroups) {
      for (const [group, gc] of Object.entries(vendor.deviceGroups)) {
        if (gc.productIds.includes(productId)) {
          return { manufacturer: vendor.manufacturer, handler: vendor.handler, model: `${vendor.manufacturer} ${group}`, modelConfig: { ...vendor.defaultModelConfig, ...gc.modelConfig } }
        }
      }
    }
    return { manufacturer: vendor.manufacturer, handler: vendor.handler, model: name || `${vendor.manufacturer} device`, modelConfig: { ...vendor.defaultModelConfig } }
  }
  return null
}
