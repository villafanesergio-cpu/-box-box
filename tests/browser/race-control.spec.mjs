import { test, expect } from '@playwright/test';
const api = 'http://127.0.0.1:54329';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';

test.beforeEach(async ({page,context,request}) => {
  await request.get(`${api}/__reset`);
  const payload = Buffer.from(JSON.stringify({sub:a,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url');
  const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${payload}.fake`;
  const session = {access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:a,aud:'authenticated',role:'authenticated'}};
  await context.addCookies([{name:'sb-127-auth-token',value:`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,domain:'127.0.0.1',path:'/'}]);
  await page.goto('/race-control/race');
  await expect(page.getByRole('heading',{name:'Preparar carrera 1'})).toBeVisible();
});

test('seven GP races: qualifying, inverted short grids, manual final, pit review, reload and correction', async ({page,request}) => {
  for (let n=1;n<=7;n++) {
    const type = n===1 ? 'sprint' : n===7 ? 'final':'short';
    await expect(page.getByLabel('Tipo de carrera')).toHaveValue(type);
    await expect(page.getByLabel('Parrilla de salida')).toHaveValue(type==='short' ? 'inverted':'manual');
    await page.getByRole('button',{name:`PREPARAR CARRERA ${n}`,exact:true}).click();
    if (type !== 'short') {
      await expect(page.getByText(type==='final' ? /Clasificación a una vuelta:/ : /Clasificación de aproximadamente/)).toBeVisible();
      await page.getByRole('button',{name:'CONFIRMAR CLASIFICACIÓN',exact:true}).click();
    }
    const cards = page.locator('section').filter({has:page.getByRole('button',{name:'CONFIRMAR PARRILLA',exact:true})}).locator('article');
    await expect(cards.first()).toContainText(type==='short' ? (n%2===0 ? 'Piloto B':'Piloto A') : 'Piloto A');
    await page.getByRole('button',{name:'CONFIRMAR PARRILLA',exact:true}).click();
    if (type==='final') {
      await page.getByRole('button',{name:'GUARDAR RESULTADO',exact:true}).click();
      await expect(page.getByText(/Revisá manualmente la parada/)).toBeVisible();
      expect((await (await request.get(`${api}/__writes`)).json()).length).toBe(6);
      await page.getByLabel('Parada obligatoria de Piloto A').selectOption('yes');
      await page.getByLabel('Parada obligatoria de Piloto B').selectOption('no');
    }
    await page.getByRole('button',{name:'GUARDAR RESULTADO',exact:true}).click();
    await expect(page.getByText('Carrera guardada.',{exact:true})).toBeVisible();
  }
  const writes = await (await request.get(`${api}/__writes`)).json();
  expect(writes.map(w=>w.p_control.type)).toEqual(['sprint','short','short','short','short','short','final']);
  expect(writes[6].p_control.qualifying_order).toEqual([a,b]);
  expect(writes[6].p_control.pit_stops).toEqual({[a]:'yes',[b]:'no'});
  expect(writes[6].p_results.map(r=>r.final_points)).toEqual([2,1]); // No automatic sanction
  await page.reload();
  await expect(page.getByText(/CARRERA 7 · Fase 3/)).toBeVisible();
  const finalRow = page.locator('article').filter({hasText:/CARRERA 7 · Fase 3/});
  await finalRow.getByText('Parrilla, clasificación y controles').click();
  await expect(finalRow.getByText('Piloto B: No cumplió')).toBeVisible();
  await finalRow.getByRole('button',{name:'Corregir',exact:true}).click();
  await expect(page.getByLabel('Parada obligatoria de Piloto B')).toHaveValue('no');
  await page.getByRole('button',{name:'GUARDAR CORRECCIÓN',exact:true}).click();
  await expect(page.getByText('Carrera corregida.',{exact:true})).toBeVisible();
});

test('legacy data keeps its type, final inversion requires confirmation, failed writes keep the editor', async ({page,request}) => {
  await request.get(`${api}/__legacy`);
  await page.reload();
  await expect(page.getByLabel('Tipo de carrera')).toHaveValue('standard');
  await expect(page.getByText(/Formato anterior \(sin tipo registrado\)/)).toBeVisible();
  await page.getByLabel('Tipo de carrera').selectOption('final');
  await page.getByLabel('Parrilla de salida').selectOption('inverted');
  page.once('dialog', dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'PREPARAR CARRERA 5',exact:true}).click();
  await expect(page.getByRole('button',{name:'CONFIRMAR CLASIFICACIÓN',exact:true})).not.toBeVisible();
  await page.getByLabel('Parrilla de salida').selectOption('manual');
  await page.getByRole('button',{name:'PREPARAR CARRERA 5',exact:true}).click();
  await page.getByRole('button',{name:'CONFIRMAR CLASIFICACIÓN',exact:true}).click();
  await page.getByRole('button',{name:'CONFIRMAR PARRILLA',exact:true}).click();
  await page.getByLabel('Parada obligatoria de Piloto A').selectOption('yes');
  await page.getByLabel('Parada obligatoria de Piloto B').selectOption('yes');
  await request.get(`${api}/__fail`);
  await page.getByRole('button',{name:'GUARDAR RESULTADO',exact:true}).click();
  await expect(page.getByText(/No se guardó la carrera: simulated write failure/)).toBeVisible();
  await expect(page.getByLabel('Parada obligatoria de Piloto A')).toHaveValue('yes');
});
