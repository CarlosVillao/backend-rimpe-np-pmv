export const calcularComision = (numeroNotas) => {
  let tarifa = 0;

  if (numeroNotas >= 1 && numeroNotas <= 199) {
    tarifa = 0.20;
  } else if (numeroNotas >= 200 && numeroNotas <= 499) {
    tarifa = 0.18;
  } else if (numeroNotas >= 500) {
    tarifa = 0.15;
  }

  // Si no hay notas, la comisión es 0
  const totalComision = numeroNotas > 0 ? numeroNotas * tarifa : 0;

  return {
    notas_generadas: numeroNotas,
    tarifa_aplicada: tarifa,
    total_comision: Number(totalComision.toFixed(2)),
  };
};