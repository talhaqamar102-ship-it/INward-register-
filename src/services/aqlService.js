/**
 * ISO 2859-1 / ANSI/ASQ Z1.4 Standard
 * General Inspection Level II - Normal Single Sampling Plan (AQL 1.5)
 */
export class AQLService {
  static getSamplingPlan(lotSize, aql = 1.5) {
    const size = Number(lotSize);
    let code = 'A';
    let sampleSize = 2;
    let acceptLimit = 0;
    let rejectLimit = 1;

    if (size <= 8) {
      code = 'A'; sampleSize = 2; acceptLimit = 0; rejectLimit = 1;
    } else if (size <= 15) {
      code = 'B'; sampleSize = 3; acceptLimit = 0; rejectLimit = 1;
    } else if (size <= 25) {
      code = 'C'; sampleSize = 5; acceptLimit = 0; rejectLimit = 1;
    } else if (size <= 50) {
      code = 'D'; sampleSize = 8; acceptLimit = 0; rejectLimit = 1;
    } else if (size <= 90) {
      code = 'E'; sampleSize = 13; acceptLimit = 0; rejectLimit = 1;
    } else if (size <= 150) {
      code = 'F'; sampleSize = 20; acceptLimit = 1; rejectLimit = 2;
    } else if (size <= 280) {
      code = 'G'; sampleSize = 32; acceptLimit = 1; rejectLimit = 2;
    } else if (size <= 500) {
      code = 'H'; sampleSize = 50; acceptLimit = 2; rejectLimit = 3;
    } else if (size <= 1200) {
      code = 'J'; sampleSize = 80; acceptLimit = 3; rejectLimit = 4;
    } else if (size <= 3200) {
      code = 'K'; sampleSize = 125; acceptLimit = 5; rejectLimit = 6;
    } else if (size <= 10000) {
      code = 'L'; sampleSize = 200; acceptLimit = 7; rejectLimit = 8;
    } else {
      code = 'M'; sampleSize = 315; acceptLimit = 10; rejectLimit = 11;
    }

    return {
      standard: 'ISO 2859-1 (Level II)',
      aqlTarget: aql,
      lotSize: size,
      codeLetter: code,
      sampleSize,
      acceptLimit,
      rejectLimit
    };
  }

  static evaluateLot(lotSize, foundDefects, aql = 1.5) {
    const plan = this.getSamplingPlan(lotSize, aql);
    const defects = Number(foundDefects);
    const isApproved = defects <= plan.acceptLimit;

    return {
      ...plan,
      foundDefects: defects,
      verdict: isApproved ? 'AQL_PASSED' : 'QUARANTINED',
      isApproved,
      message: isApproved 
        ? `Passed AQL ${aql} (Found ${defects} defects <= ${plan.acceptLimit} allowed). Lot approved for export.`
        : `FAILED AQL ${aql} (Found ${defects} defects >= ${plan.rejectLimit} reject limit). Entire lot QUARANTINED.`
    };
  }
}
