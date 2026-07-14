
"use client";

import { useMemo, useState } from "react";

const pilotos = [
  { nombre: "Martín", puntos: 254, dnf: 10, victorias: 4, numero: "—", escuderia: "Pendiente", iniciales: "MA" },
  { nombre: "Sergio", puntos: 235, dnf: 7, victorias: 4, numero: "—", escuderia: "Pendiente", iniciales: "SE" },
  { nombre: "Rodri", puntos: 213, dnf: 14, victorias: 1, numero: "—", escuderia: "Pendiente", iniciales: "RO" },
  { nombre: "Nico", puntos: 175, dnf: 12, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "NI" },
  { nombre: "Gonzalo Herrera", puntos: 125, dnf: 9, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "GH" },
  { nombre: "Loren", puntos: 98, dnf: 11, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "LO" },
  { nombre: "Álvaro", puntos: 84, dnf: 6, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "ÁL" },
  { nombre: "Eze", puntos: 55, dnf: 2, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "EZ" },
  { nombre: "Dodi", puntos: 43, dnf: 4, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "DO" },
  { nombre: "Paola", puntos: 42, dnf: 2, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "PA" },
  { nombre: "Pasti", puntos: 31, dnf: 6, victorias: 0, numero: "—", escuderia: "Pendiente", iniciales: "PS" }
];

const ganadores = [
  { piloto: "Martín", gps: ["Imola", "Baku", "México", "Austria"] },
  { piloto: "Sergio", gps: ["Canadá", "Silverstone", "Monza", "Suzuka"] },
  { piloto: "Rodri", gps: ["Hungría"] }
];

const noticias = [
  { titulo: "Sergio queda a 19 puntos del líder", texto: "La pelea por el campeonato se aprieta después de Austria." },
  { titulo: "Rodri lidera la tabla de DNF", texto: "Acumula 14 abandonos en la temporada 2026." },
  { titulo: "Empate en victorias", texto: "Martín y Sergio tienen cuatro Grand Prix ganados cada uno." }
];

function Tabla({ limite }) {
  const lista = limite ? pilotos.slice(0, limite) : pilotos;
  return (
    <div className="tabla">
      {lista.map((p, i) => (
        <div className="fila" key={p.nombre}>
          <div className={`pos pos-${i + 1}`}>{i + 1}</div>
          <div className="avatar">{p.iniciales}</div>
          <div className="piloto-info">
            <strong>{p.nombre}</strong>
            <span>{p.escuderia} · {p.victorias} GP · {p.dnf} DNF</span>
          </div>
          <div className="pts">{p.puntos}<small>PTS</small></div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [seccion, setSeccion] = useState("inicio");
  const [carreraActiva, setCarreraActiva] = useState(false);
  const [seleccionados, setSeleccionados] = useState(() => pilotos.slice(0, 7).map(p => p.nombre));
  const [orden, setOrden] = useState([]);

  const puntosCarrera = useMemo(() => {
    return orden.map((nombre, index) => ({
      nombre,
      puntos: Math.max(seleccionados.length - index, 0)
    }));
  }, [orden, seleccionados]);

  const alternarPiloto = (nombre) => {
    setSeleccionados(prev =>
      prev.includes(nombre) ? prev.filter(x => x !== nombre) : [...prev, nombre]
    );
    setOrden(prev => prev.filter(x => x !== nombre));
  };

  const agregarOrden = (nombre) => {
    if (!orden.includes(nombre)) setOrden(prev => [...prev, nombre]);
  };

  return (
    <main className="app">
      <header className="header">
        <div className="marca">
          <img src="/box-box-logo.png" alt="BOX BOX" />
          <div>
            <strong>BOX BOX</strong>
            <span>Mundial 2026</span>
          </div>
        </div>
        <button className="pill">Temporada activa</button>
      </header>

      <section className={`vista ${seccion === "inicio" ? "activa" : ""}`}>
        <div className="hero">
          <div>
            <span className="eyebrow">CAMPEONATO OFICIAL</span>
            <h1>BOX BOX<br />MUNDIAL 2026</h1>
            <p>Noticias, estadísticas, pilotos y resultados de toda la competición.</p>
            <div className="acciones">
              <button onClick={() => setSeccion("estadisticas")} className="btn rojo">Ver campeonato</button>
              <button onClick={() => setSeccion("carrera")} className="btn oscuro">Abrir modo carrera</button>
            </div>
          </div>
        </div>

        <div className="resumen-grid">
          <article className="card"><span>Líder</span><strong>Martín</strong><small>254 puntos</small></article>
          <article className="card"><span>Diferencia</span><strong>19 pts</strong><small>Sergio se acerca</small></article>
          <article className="card"><span>GP disputados</span><strong>9</strong><small>Temporada 2026</small></article>
          <article className="card"><span>Más DNF</span><strong>Rodri</strong><small>14 abandonos</small></article>
        </div>

        <div className="dos-columnas">
          <section className="panel">
            <div className="panel-head"><h2>Campeonato</h2><button onClick={() => setSeccion("estadisticas")}>Ver todo</button></div>
            <Tabla limite={6} />
          </section>
          <section className="panel noticias">
            <div className="panel-head"><h2>Noticias BOX BOX</h2></div>
            {noticias.map(n => <article key={n.titulo}><strong>{n.titulo}</strong><p>{n.texto}</p></article>)}
          </section>
        </div>
      </section>

      <section className={`vista ${seccion === "estadisticas" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>📊</span><div><h1>Estadísticas</h1><p>Todo el Mundial 2026 en un solo lugar.</p></div></div>
        <div className="dos-columnas">
          <section className="panel"><div className="panel-head"><h2>Campeonato de pilotos</h2></div><Tabla /></section>
          <div className="stack">
            <section className="panel">
              <div className="panel-head"><h2>Cazadores de trofeos</h2></div>
              {ganadores.map(g => <div className="trofeo" key={g.piloto}><strong>{g.piloto}</strong><span>{g.gps.length} victorias</span><small>{g.gps.join(" · ")}</small></div>)}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Rey del DNF</h2></div>
              {[...pilotos].sort((a,b)=>b.dnf-a.dnf).slice(0,5).map((p,i)=><div className="mini-fila" key={p.nombre}><b>{i+1}</b><span>{p.nombre}</span><strong>{p.dnf}</strong></div>)}
            </section>
          </div>
        </div>
      </section>

      <section className={`vista ${seccion === "carrera" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>🏁</span><div><h1>Modo Carrera</h1><p>Seleccioná participantes y cargá el orden de llegada.</p></div></div>

        {!carreraActiva ? (
          <section className="panel">
            <div className="panel-head"><h2>Nueva carrera</h2><span>{seleccionados.length} participantes</span></div>
            <div className="selector-pilotos">
              {pilotos.map(p => (
                <button key={p.nombre} onClick={() => alternarPiloto(p.nombre)} className={seleccionados.includes(p.nombre) ? "seleccionado" : ""}>
                  <span className="avatar">{p.iniciales}</span>
                  <strong>{p.nombre}</strong>
                  <small>{p.escuderia}</small>
                </button>
              ))}
            </div>
            <button className="btn rojo ancho" disabled={seleccionados.length < 2} onClick={() => setCarreraActiva(true)}>Iniciar carrera</button>
          </section>
        ) : (
          <div className="dos-columnas">
            <section className="panel">
              <div className="panel-head"><h2>Orden de llegada</h2><button onClick={() => {setOrden([]);setCarreraActiva(false)}}>Cancelar</button></div>
              <p className="ayuda">Tocá los pilotos en el orden en que terminaron.</p>
              <div className="selector-pilotos compacto">
                {seleccionados.map(nombre => {
                  const p = pilotos.find(x => x.nombre === nombre);
                  const posicion = orden.indexOf(nombre);
                  return (
                    <button key={nombre} disabled={posicion >= 0} onClick={() => agregarOrden(nombre)} className={posicion >= 0 ? "usado" : ""}>
                      <span className="avatar">{p.iniciales}</span>
                      <strong>{nombre}</strong>
                      {posicion >= 0 && <b>{posicion + 1}°</b>}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="panel marcador">
              <div className="panel-head"><h2>Puntos de la carrera</h2><span>En vivo</span></div>
              {puntosCarrera.length === 0 && <p className="ayuda">Todavía no cargaste posiciones.</p>}
              {puntosCarrera.map((r,i)=><div className="mini-fila" key={r.nombre}><b>{i+1}°</b><span>{r.nombre}</span><strong>+{r.puntos}</strong></div>)}
              {orden.length === seleccionados.length && <button className="btn rojo ancho">Guardar resultado</button>}
            </section>
          </div>
        )}
      </section>

      <section className={`vista ${seccion === "pilotos" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>👤</span><div><h1>Pilotos</h1><p>Foto, número, escudería y rendimiento.</p></div></div>
        <div className="pilotos-grid">
          {pilotos.map(p => (
            <article className="piloto-card" key={p.nombre}>
              <div className="foto-placeholder">{p.iniciales}</div>
              <div className="numero">#{p.numero}</div>
              <h3>{p.nombre}</h3>
              <p>{p.escuderia}</p>
              <div className="metricas">
                <span><b>{p.puntos}</b>PTS</span>
                <span><b>{p.victorias}</b>GP</span>
                <span><b>{p.dnf}</b>DNF</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`vista ${seccion === "admin" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>⚙️</span><div><h1>Race Control</h1><p>Panel administrable de BOX BOX.</p></div></div>
        <div className="admin-grid">
          {[
            ["Pilotos","Alta, baja, edición, foto, número y escudería."],
            ["Escuderías","Nombre, logo, colores y estado."],
            ["Temporadas","Crear nuevas temporadas y mantener el historial."],
            ["Grand Prix","Circuito, fecha, participantes y estado."],
            ["Resultados","Carga y corrección de posiciones y DNF."],
            ["Configuración","Sistema de puntos, permisos y opciones."]
          ].map(([t,d]) => <button className="admin-card" key={t}><strong>{t}</strong><span>{d}</span></button>)}
        </div>
        <div className="aviso">La conexión a Supabase será el siguiente paso. En esta versión los datos todavía son de demostración.</div>
      </section>

      <nav className="nav">
        {[
          ["inicio","🏠","Inicio"],
          ["estadisticas","📊","Estadísticas"],
          ["carrera","🏁","Modo Carrera"],
          ["pilotos","👤","Pilotos"],
          ["admin","⚙️","Race Control"]
        ].map(([id,icon,label]) => (
          <button key={id} onClick={() => setSeccion(id)} className={seccion === id ? "activo" : ""}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}
