import Link from "next/link";
import styles from "./race-control.module.css";
import LogoutButton from "./logout-button";

const modules = [
  {
    href: "/race-control/race",
    icon: "🎛️",
    title: "Dirección de Carrera",
    description: "Abrir circuitos, seleccionar pilotos y cargar resultados.",
    status: "ACTIVO",
  },
  {
    href: "/race-control/circuits",
    icon: "🏁",
    title: "Circuitos",
    description: "Nombre, país, bandera, trazado e imágenes.",
    status: "ACTIVO",
  },
  {
    href: "/race-control/drivers",
    icon: "👤",
    title: "Pilotos",
    description: "Nombre, número, escudería, estilo y archivos visuales.",
    status: "ACTIVO",
  },
  {
    href: "/race-control/teams",
    icon: "🏎️",
    title: "Escuderías",
    description: "Nombre, logo, colores y estado.",
    status: "ACTIVO",
  },
  {
    href: "#",
    icon: "🏆",
    title: "Temporadas",
    description: "Crear temporadas y conservar el historial.",
    status: "PRÓXIMAMENTE",
  },
  {
    href: "#",
    icon: "📋",
    title: "Resultados",
    description: "Historial completo, correcciones y auditoría.",
    status: "PRÓXIMAMENTE",
  },
];

export default function RaceControlPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · ADMINISTRACIÓN PRIVADA</span>
          <h1>Race Control</h1>
          <p>Centro de operaciones del campeonato.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" className={styles.back}>Volver a BOX BOX</Link>
          <LogoutButton />
        </div>
      </header>

      <section className={styles.grid}>
        {modules.map((module) => {
          const content = (
            <>
              <div className={styles.icon}>{module.icon}</div>
              <div>
                <span className={module.status === "ACTIVO" ? styles.active : styles.soon}>
                  {module.status}
                </span>
                <h2>{module.title}</h2>
                <p>{module.description}</p>
              </div>
            </>
          );

          return module.href === "#" ? (
            <article className={`${styles.card} ${styles.disabled}`} key={module.title}>{content}</article>
          ) : (
            <Link className={styles.card} href={module.href} key={module.title}>{content}</Link>
          );
        })}
      </section>
    </main>
  );
}
