// Local fake Supabase API. No production credentials or outbound requests.
import http from 'node:http';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';
const user = {id:a,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{}};
const event = {id:'event-1',season_id:'season-1',status:'open',round_number:9,event_date:'2026-10-24',circuit_id:'circuit-1',circuit:{id:'circuit-1',name:'San Lorenzo',country:'Salta'}};
let races = [], writes = [], fail = false;
const server = http.createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Content-Type','application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  const url = new URL(req.url,'http://localhost');
  const send = data => res.end(JSON.stringify(data));
  if (url.pathname === '/__reset') { races = []; writes = []; fail = false; return send({}); }
  if (url.pathname === '/__fail') { fail = true; return send({}); }
  if (url.pathname === '/__writes') return send(writes);
  if (url.pathname === '/__legacy') {
    races = [{id:'legacy',event_id:event.id,race_number:4,race_control:null,race_results:[{driver_id:a,finish_position:1,status:'finished',final_points:2},{driver_id:b,finish_position:2,status:'finished',final_points:1}]}];
    return send({});
  }
  if (url.pathname.startsWith('/auth/v1/')) return send(user);
  if (url.pathname.endsWith('/rpc/save_race_control')) {
    writes.push(body);
    if (fail) { fail = false; res.statusCode=400; return send({message:'simulated write failure'}); }
    const id = body.p_race_id ?? `race-${races.length+1}`;
    const previous = races.find(r => r.id === id);
    const row = {id,event_id:event.id,race_number:previous?.race_number ?? Math.max(0,...races.map(r=>r.race_number))+1,
      race_control:body.p_control,race_results:body.p_results};
    races = [...races.filter(r => r.id !== id),row].sort((a,b)=>a.race_number-b.race_number);
    return send(id);
  }
  const table = url.pathname.split('/').at(-1);
  let data = [];
  if (table === 'seasons') data = [{id:'season-1',name:'BoxBox 2026',year:2026}];
  if (table === 'circuits') data = [event.circuit];
  if (table === 'season_driver_teams') data = [a,b].map((id,i)=>({id,active:true,racing_number:i+1,driver:{id,name:i ? 'Piloto B':'Piloto A',active:true,photo_transparent_url:'/box-box-logo.png'},team:{id:'team',name:'Team',active:true,logo_url:'/box-box-logo.png'}}));
  if (table === 'circuit_events') data = url.searchParams.get('status') === 'eq.finalized' ? [] : [event];
  if (table === 'event_participants') data = [a,b].map(driver_id=>({event_id:event.id,driver_id,active:true}));
  if (table === 'races') data = races;
  if (table === 'race_results') data = races.find(r=>`eq.${r.id}` === url.searchParams.get('race_id'))?.race_results ?? [];
  if (table === 'race_starters') data = [a,b].map((driver_id,i)=>({driver_id,grid_position:i+1}));
  send(req.headers.accept?.includes('application/vnd.pgrst.object') ? (data[0] ?? null) : data);
});
server.listen(54329,'127.0.0.1');
