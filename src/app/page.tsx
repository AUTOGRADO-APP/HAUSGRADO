import { redirect } from "next/navigation";
// O middleware já manda cada perfil para a página inicial certa; isto é só um fallback.
export default function Home() { redirect("/quadro"); }
