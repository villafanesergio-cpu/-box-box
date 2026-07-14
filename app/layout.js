import "./globals.css";

export const metadata = {
  title: "BOX BOX",
  description: "Aplicación oficial del campeonato BOX BOX",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
