export const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-aezakmi-edge-id, x-aezakmi-edge-token','Access-Control-Allow-Methods':'POST,OPTIONS'}
export function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
