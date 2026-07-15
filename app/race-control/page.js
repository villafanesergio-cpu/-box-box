import Link from "next/link";
import styles from "./race-control.module.css";

const modules = [
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
    icon: "🗺️",
    title: "Circuitos",
    description: "Calendario, bandera e imagen propia.",
    status: "PRÓXIMAMENTE",
  },
  {
    href: "#",
    icon: "📋",
    title: "Resultados",
    description: "Carga, corrección, DNF y penalizaciones.",
    status: "PRÓXIMAMENTE",
  },
  {
    href: "#",
    icon: "⚙️",
    title: "Configuración",
    description: "Puntos, permisos y preferencias.",
    status: "PRÓXIMAMENTE",
  },
];

export default function RaceControlPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · ADMINISTRACIÓN</span>
          <h1>Race Control</h1>
          <p>Configuración online del campeonato.</p>
        </div>
        <Link href="/" className={styles.back}>Volver a BOX BOX</Link>
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
            <article className={`${styles.card} ${styles.disabled}`} key={module.title}>
              {content}
            </article>
          ) : (
            <Link className={styles.card} href={module.href} key={module.title}>
              {content}
            </Link>
          );
        })}
      </section>
    </main>
  );
}
