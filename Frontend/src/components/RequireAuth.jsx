import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ user, allowAdmin = false, loginPath = "/voter/login", children }) {
  const location = useLocation();

  if (!user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (!allowAdmin && user.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
