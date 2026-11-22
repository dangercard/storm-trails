/**
 * How the data build reads an IBTrACS report (scripts/classify.mjs): Saffir-Simpson, wind extents, and each regional
 * agency's class, checked at every threshold from both sides, on reports made up with only the columns that matter.
 */
import { describe, expect, it } from 'vitest';
import { AGENCY, CAT, catFromWind, categoryOf, radiiOf, regionalOf } from '../scripts/classify.mjs';
import { REGIONAL, regional } from '../src/data/categories';

/** A report with these columns (any other is blank, as in IBTrACS) */
const report = (cols: Record<string, string | number>) => (col: string) => String(cols[col] ?? '');

describe('Saffir-Simpson from wind', () => {
  it.each([
    [33, CAT.depression],
    [34, CAT.storm],
    [63, CAT.storm],
    [64, 1],
    [82, 1],
    [83, 2],
    [95, 2],
    [96, 3],
    [112, 3],
    [113, 4],
    [136, 4],
    [137, 5],
    [185, 5],
  ])('%i kt is category %i', (kt, cat) => expect(catFromWind(kt)).toBe(cat));
});

describe('a report’s category', () => {
  it('takes the Saffir-Simpson category IBTrACS gives over the wind', () => {
    expect(categoryOf(report({ USA_SSHS: 3, USA_WIND: 140, NATURE: 'TS' }))).toBe(3);
    expect(categoryOf(report({ USA_SSHS: -1, USA_WIND: 30, NATURE: 'TS' }))).toBe(CAT.depression);
  });
  it('reads the stages that aren’t tropical', () => {
    expect(categoryOf(report({ USA_SSHS: -2, USA_WIND: 45 }))).toBe(CAT.subtropical);
    expect(categoryOf(report({ USA_SSHS: -4, USA_WIND: 60 }))).toBe(CAT.postTropical);
    expect(categoryOf(report({ NATURE: 'ET', WMO_WIND: 60 }))).toBe(CAT.postTropical);
    expect(categoryOf(report({ USA_SSHS: -3 }))).toBe(CAT.disturbance);
    expect(categoryOf(report({ NATURE: 'DS', WMO_WIND: 25 }))).toBe(CAT.disturbance);
  });
  it('works it out from the US wind, else the WMO agency’s, when there’s no category', () => {
    expect(categoryOf(report({ NATURE: 'TS', USA_WIND: 100, WMO_WIND: 80 }))).toBe(3);
    expect(categoryOf(report({ NATURE: 'TS', WMO_WIND: 80 }))).toBe(1);
  });
  it('is unknown with nothing to go on', () => {
    expect(categoryOf(report({ NATURE: 'TS' }))).toBe(CAT.unknown);
  });
});

describe('wind extents (radii)', () => {
  const usa = {
    USA_R34_NE: 120, USA_R34_SE: 100, USA_R34_SW: 60, USA_R34_NW: 80,
    USA_R50_NE: 50, USA_R50_SE: 40, USA_R50_SW: 0, USA_R50_NW: 30,
    USA_R64_NE: 20, USA_R64_SE: 15, USA_R64_SW: 0, USA_R64_NW: 10,
  };
  it('reads the 12 quarters in order: 34 kt NE…NW, then 50 kt, then 64 kt', () => {
    expect(radiiOf(report(usa))).toEqual([120, 100, 60, 80, 50, 40, 0, 30, 20, 15, 0, 10]);
  });
  it('takes a blank among filled quarters, and missing 50/64 kt, as none', () => {
    expect(radiiOf(report({ USA_R34_NE: 90, USA_R34_SE: '', USA_R34_SW: 40, USA_R34_NW: 50 }))).toEqual([
      90, 0, 40, 50, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
  it('uses one agency’s set, the US agencies first, then Météo-France, then Australia', () => {
    const reunion = { REUNION_R34_NE: 70, REUNION_R34_SE: 70, REUNION_R34_SW: 70, REUNION_R34_NW: 70 };
    const bom = { BOM_R34_NE: 50, BOM_R34_SE: 50, BOM_R34_SW: 50, BOM_R34_NW: 50 };
    expect(radiiOf(report({ ...usa, ...reunion }))![0]).toBe(120);
    expect(radiiOf(report({ ...reunion, ...bom }))![0]).toBe(70);
    expect(radiiOf(report(bom))![0]).toBe(50);
  });
  it('is null when no agency estimated them', () => {
    expect(radiiOf(report({ USA_WIND: 100 }))).toBeNull();
  });
});

/** The class code of a report from an agency, or null */
const classOf = (agency: string, cols: Record<string, string | number>) =>
  regionalOf(report({ WMO_AGENCY: agency, NATURE: 'TS', ...cols }))?.code ?? null;

describe('regional classes', () => {
  describe('Japan (JMA): its grades as recorded, typhoons split by its 10-minute wind', () => {
    it.each([
      [2, '', 11],
      [3, 40, 12],
      [4, 55, 13],
      [5, 64, 14],
      [5, 84, 14],
      [5, 85, 15],
      [5, 104, 15],
      [5, 105, 16],
      [5, '', 14],
    ])('grade %s at %s kt is %i', (grade, wind, code) =>
      expect(classOf('tokyo', { TOKYO_GRADE: grade, TOKYO_WIND: wind })).toBe(code),
    );
    it('keeps the grade even where the wind disagrees', () => {
      expect(classOf('tokyo', { TOKYO_GRADE: 5, TOKYO_WIND: 55 })).toBe(14);
      expect(classOf('tokyo', { TOKYO_GRADE: 3, TOKYO_WIND: 50 })).toBe(12);
    });
    it('gives no class to extratropical (6) or "storm or stronger" (9) reports', () => {
      expect(classOf('tokyo', { TOKYO_GRADE: 6, TOKYO_WIND: 50 })).toBeNull();
      expect(classOf('tokyo', { TOKYO_GRADE: 9 })).toBeNull();
    });
  });

  describe('India (IMD): today’s thresholds on its 3-minute wind', () => {
    it.each([
      [17, 21], [27, 21], [28, 22], [33, 22], [34, 23], [47, 23], [48, 24], [63, 24], [64, 25], [89, 25], [90, 26],
      [119, 26], [120, 27],
    ])('%i kt is %i', (wind, code) => expect(classOf('newdelhi', { NEWDELHI_GRADE: 'D', NEWDELHI_WIND: wind })).toBe(code));
    it('uses the grade without a wind (or one under a depression’s)', () => {
      expect(classOf('newdelhi', { NEWDELHI_GRADE: 'DD' })).toBe(22);
      expect(classOf('newdelhi', { NEWDELHI_GRADE: 'D', NEWDELHI_WIND: 10 })).toBe(21);
      expect(classOf('newdelhi', { NEWDELHI_GRADE: 'SuCS' })).toBe(27);
    });
    it('reads an old "severe cyclonic storm" at 115 kt as extremely severe, on today’s scale', () => {
      expect(classOf('newdelhi', { NEWDELHI_GRADE: 'SCS', NEWDELHI_WIND: 115 })).toBe(26);
    });
    it('gives no class to a low', () => expect(classOf('newdelhi', { NEWDELHI_GRADE: 'L', NEWDELHI_WIND: 15 })).toBeNull());
  });

  describe('Météo-France La Réunion: its thresholds on its 10-minute wind', () => {
    it.each([
      [27, 31], [28, 32], [33, 32], [34, 33], [47, 33], [48, 34], [63, 34], [64, 35], [89, 35], [90, 36], [115, 36],
      [116, 37],
    ])('%i kt is %i', (wind, code) => expect(classOf('reunion', { REUNION_TYPE: 3, REUNION_WIND: wind })).toBe(code));
    it('gives no class where it isn’t tropical by Météo-France’s own reading', () => {
      for (const type of [5, 6, 7, 8, 99]) expect(classOf('reunion', { REUNION_TYPE: type, REUNION_WIND: 50 })).toBeNull();
    });
    it('calls a disturbance one without a wind, but needs a wind for anything stronger', () => {
      expect(classOf('reunion', { REUNION_TYPE: 1 })).toBe(31);
      expect(classOf('reunion', { REUNION_TYPE: 2 })).toBeNull();
    });
  });

  describe('the Australian scale (BoM, Fiji, New Zealand) on their 10-minute wind', () => {
    it.each([
      [33, 41], [34, 42], [47, 42], [48, 43], [63, 43], [64, 44], [85, 44], [86, 45], [107, 45], [108, 46],
    ])('BoM %i kt is %i', (wind, code) => expect(classOf('bom', { BOM_TYPE: 20, BOM_WIND: wind })).toBe(code));
    it('BoM: no class where it isn’t tropical, or without a wind', () => {
      for (const type of [50, 51, 60, 70, 80]) expect(classOf('bom', { BOM_TYPE: type, BOM_WIND: 50 })).toBeNull();
      expect(classOf('bom', { BOM_TYPE: 30 })).toBeNull();
    });
    it('Fiji and New Zealand: by their own wind, while tropical', () => {
      expect(classOf('nadi', { NADI_WIND: 150 })).toBe(56);
      expect(classOf('wellington', { WELLINGTON_WIND: 70 })).toBe(64);
      expect(classOf('nadi', { NADI_WIND: 150, NATURE: 'ET' })).toBeNull();
    });
  });

  it('keeps the agency’s own wind with the class', () => {
    expect(regionalOf(report({ WMO_AGENCY: 'tokyo', TOKYO_GRADE: 5, TOKYO_WIND: 125 }))).toEqual({ code: 16, wind: 125 });
  });

  it('gives none where Saffir-Simpson is the official scale, or there’s no agency', () => {
    for (const agency of ['hurdat_atl', 'hurdat_epa', 'cphc', 'atcf', '']) {
      expect(classOf(agency, { USA_WIND: 120, TOKYO_GRADE: 5, TOKYO_WIND: 120 })).toBeNull();
    }
  });

  it('matches the site’s list of agencies and their classes (src/data/categories.ts), in every code the build can write', () => {
    const highest: Record<string, number> = { tokyo: 6, newdelhi: 7, reunion: 7, bom: 6, nadi: 6, wellington: 6 };
    for (const [agency, n] of Object.entries(AGENCY)) {
      expect(REGIONAL[n as keyof typeof REGIONAL], agency).toBeDefined();
      for (let cls = 1; cls <= highest[agency]; cls++) expect(regional(n * 10 + cls)?.name, `${agency} ${cls}`).toBeTruthy();
      expect(regional(n * 10 + highest[agency] + 1)).toBeNull();
    }
  });
});
