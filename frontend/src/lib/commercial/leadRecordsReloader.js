// Recarga los registros comerciales de un lead después de un cambio de etapa sin perder estado.
// getCommercialRecords devuelve {} ante cualquier error, así que una respuesta sin el lead
// conserva los registros actuales (si no, la insignia volvería a "Nuevo"). Después de un cambio
// el lead siempre tiene al menos un registro, por lo que su ausencia solo puede ser un error.
// Además, solo se aplica la respuesta de la última recarga pedida para cada lead: una más
// antigua que llegue tarde no pisa el estado más nuevo.
export function createLeadRecordsReloader(load, apply) {
  const latestRequest = {};
  return (leadId) => {
    const request = (latestRequest[leadId] || 0) + 1;
    latestRequest[leadId] = request;
    return load(leadId).then((records) => {
      if (latestRequest[leadId] !== request || !records?.[leadId]) return;
      apply(leadId, records[leadId]);
    });
  };
}
