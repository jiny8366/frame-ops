/**
 * 도수 조합에서 결정적 SKU 생성.
 * lens.productCode 가 'ACU-OAS' 일 때:
 *   spherical:  ACU-OAS-S-300              (sph -3.00)
 *   spherical:  ACU-OAS-S+100              (sph +1.00)
 *   toric:      ACU-OAS-S-300-C-075-A-180  (sph -3.00, cyl -0.75, axis 180)
 *   multifocal: ACU-OAS-S-300-ADD-200      (sph -3.00, add +2.00)
 */
export interface PrescriptionParts {
  sphere: number;
  cylinder?: number | null;
  axis?: number | null;
  addPower?: number | null;
}

function formatSphereLike(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  const padded = Math.round(abs * 100).toString().padStart(3, '0');
  return `${sign}${padded}`;
}

export function generateSku(
  productCode: string,
  rx: PrescriptionParts,
): string {
  const parts = [productCode, 'S' + formatSphereLike(rx.sphere)];

  if (rx.cylinder != null && rx.cylinder !== 0) {
    parts.push('C' + formatSphereLike(rx.cylinder));
    if (rx.axis != null) {
      parts.push('A' + String(rx.axis).padStart(3, '0'));
    }
  }

  if (rx.addPower != null && rx.addPower !== 0) {
    parts.push('ADD' + formatSphereLike(rx.addPower));
  }

  return parts.join('-');
}
