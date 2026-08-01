import LoginBackground from "@/components/LoginBackground";
import LoginCard from "./LoginCard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white overflow-hidden">
      <LoginBackground />
      <LoginCard error={error} />
    </div>
  );
}
