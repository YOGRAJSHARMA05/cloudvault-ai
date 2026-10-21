import { googleAuthEnabled } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return <LoginForm googleEnabled={googleAuthEnabled} />;
}