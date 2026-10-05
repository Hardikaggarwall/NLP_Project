import HomePage from "@/components/HomePage";
import ToastContainer from "@/components/Toast";
import Dashboard from "@/pages/Dashboard";
import { UserProfile } from "@/services/user.service";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

const publicUser: UserProfile = {
    id: "00000000-0000-7000-8000-000000000001",
    email: "guest@clause.local",
    name: "Guest",
};

export default function App() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: "100vh", background: "#FFFFFF" }}>
            <Routes>
                <Route
                    path="/"
                    element={
                        <HomePage
                            onOpenAuth={() => navigate("/dashboard/agreements")}
                            isAuthenticated={true}
                        />
                    }
                />

                <Route
                    path="/dashboard/*"
                    element={
                        <Dashboard user={publicUser} />
                    }
                />

                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            <ToastContainer />
        </div>
    );
}
