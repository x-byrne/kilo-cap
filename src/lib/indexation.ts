export const PRE_CGT_DATE = "1999-09-21";

export function isPreCgtAsset(acquisitionDate: string): boolean {
  return new Date(acquisitionDate) < new Date(PRE_CGT_DATE);
}

export function calculateIndexedCostBase(
  originalCostBase: number,
  acquisitionDate: string,
  disposalDate: string,
): number {
  const acqQuarter = getQuarter(new Date(acquisitionDate));
  const dispQuarter = getQuarter(new Date(disposalDate));

  const acqCpi = ATO_CPI[acqQuarter];
  const dispCpi = ATO_CPI[dispQuarter];

  if (acqCpi === undefined || dispCpi === undefined || acqCpi === 0) {
    return originalCostBase;
  }

  const indexFactor = dispCpi / acqCpi;
  return Math.round(originalCostBase * indexFactor * 100) / 100;
}

function getQuarter(date: Date): string {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

const ATO_CPI: Record<string, number> = {
  "1998-Q1": 67.8,
  "1998-Q2": 68.1,
  "1998-Q3": 68.4,
  "1998-Q4": 68.7,
  "1999-Q1": 69.3,
  "1999-Q2": 69.8,
  "1999-Q3": 70.3,
  "1999-Q4": 70.9,
  "2000-Q1": 71.5,
  "2000-Q2": 72.2,
  "2000-Q3": 72.8,
  "2000-Q4": 73.5,
  "2001-Q1": 74.2,
  "2001-Q2": 74.8,
  "2001-Q3": 75.3,
  "2001-Q4": 75.8,
  "2002-Q1": 76.2,
  "2002-Q2": 76.5,
  "2002-Q3": 76.8,
  "2002-Q4": 77.1,
  "2003-Q1": 77.4,
  "2003-Q2": 77.8,
  "2003-Q3": 78.3,
  "2003-Q4": 78.9,
  "2004-Q1": 79.4,
  "2004-Q2": 79.8,
  "2004-Q3": 80.2,
  "2004-Q4": 80.6,
  "2005-Q1": 81.0,
  "2005-Q2": 81.4,
  "2005-Q3": 81.8,
  "2005-Q4": 82.3,
  "2006-Q1": 82.7,
  "2006-Q2": 83.1,
  "2006-Q3": 83.5,
  "2006-Q4": 84.0,
  "2007-Q1": 84.4,
  "2007-Q2": 84.7,
  "2007-Q3": 85.1,
  "2007-Q4": 85.5,
  "2008-Q1": 86.0,
  "2008-Q2": 86.5,
  "2008-Q3": 87.1,
  "2008-Q4": 87.5,
  "2009-Q1": 87.8,
  "2009-Q2": 88.1,
  "2009-Q3": 88.4,
  "2009-Q4": 88.8,
  "2010-Q1": 89.1,
  "2010-Q2": 89.4,
  "2010-Q3": 89.7,
  "2010-Q4": 90.1,
  "2011-Q1": 90.4,
  "2011-Q2": 90.8,
  "2011-Q3": 91.2,
  "2011-Q4": 91.7,
  "2012-Q1": 92.2,
  "2012-Q2": 92.6,
  "2012-Q3": 93.0,
  "2012-Q4": 93.5,
  "2013-Q1": 93.9,
  "2013-Q2": 94.2,
  "2013-Q3": 94.5,
  "2013-Q4": 95.0,
  "2014-Q1": 95.4,
  "2014-Q2": 95.7,
  "2014-Q3": 96.0,
  "2014-Q4": 96.4,
  "2015-Q1": 96.7,
  "2015-Q2": 97.0,
  "2015-Q3": 97.2,
  "2015-Q4": 97.5,
  "2016-Q1": 97.8,
  "2016-Q2": 98.0,
  "2016-Q3": 98.2,
  "2016-Q4": 98.5,
  "2017-Q1": 98.8,
  "2017-Q2": 99.0,
  "2017-Q3": 99.3,
  "2017-Q4": 99.6,
  "2018-Q1": 99.9,
  "2018-Q2": 100.2,
  "2018-Q3": 100.5,
  "2018-Q4": 100.8,
  "2019-Q1": 101.1,
  "2019-Q2": 101.4,
  "2019-Q3": 101.7,
  "2019-Q4": 102.0,
  "2020-Q1": 102.3,
  "2020-Q2": 102.6,
  "2020-Q3": 102.9,
  "2020-Q4": 103.2,
  "2021-Q1": 103.5,
  "2021-Q2": 103.8,
  "2021-Q3": 104.1,
  "2021-Q4": 104.5,
  "2022-Q1": 104.8,
  "2022-Q2": 105.2,
  "2022-Q3": 105.6,
  "2022-Q4": 106.0,
  "2023-Q1": 106.4,
  "2023-Q2": 106.8,
  "2023-Q3": 107.1,
  "2023-Q4": 107.5,
  "2024-Q1": 107.8,
  "2024-Q2": 108.1,
  "2024-Q3": 108.4,
  "2024-Q4": 108.8,
  "2025-Q1": 109.1,
  "2025-Q2": 109.4,
};
