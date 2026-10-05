import { authService } from "@/services";
import React, { useState } from "react";
import BrandLogo from "./BrandLogo";
import {
    IconAlertTriangle,
    IconArrowRight,
    IconCheck,
    IconClose,
    IconMail,
    IconShieldCheck,
    InlineSpinner,
} from "./icons/CustomIcons";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;

        setLoading(true);
        setError(null);
        setMessage(null);

        const res = await authService.login(email.trim());
        setLoading(false);

        if (res.success) {
            setMessage("Signed in successfully.");
            setTimeout(() => {
                onSuccess();
                handleClose();
            }, 500);
        } else {
            setError(res.error || "Failed to sign in. Please try again.");
        }
    };

    const resetForm = () => {
        setEmail("");
        setError(null);
        setMessage(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "420px" }}
            >
                {/* Modal Header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "24px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                        }}
                    >
                        <BrandLogo size="sm" />
                    </div>

                    <button
                        onClick={handleClose}
                        className="btn btn-ghost btn-sm"
                        aria-label="Close"
                        style={{ padding: "6px" }}
                    >
                        <IconClose size={16} />
                    </button>
                </div>

                {/* Modal Title & Info */}
                <div style={{ marginBottom: "24px" }}>
                    <h2
                        style={{
                            fontSize: "1.35rem",
                            fontWeight: 700,
                            marginBottom: "6px",
                            color: "#0F172A",
                        }}
                    >
                        Sign In or Sign Up
                    </h2>
                    <p
                        style={{
                            fontSize: "0.88rem",
                            color: "#64748B",
                            lineHeight: 1.5,
                        }}
                    >
                        Enter your email to continue.
                    </p>
                </div>

                {/* Feedback Alerts */}
                {error && (
                    <div
                        style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            background: "var(--pastel-red-bg)",
                            border: "1px solid var(--pastel-red-border)",
                            color: "var(--pastel-red-text)",
                            fontSize: "0.82rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "18px",
                        }}
                    >
                        <IconAlertTriangle size={15} />
                        <span>{error}</span>
                    </div>
                )}

                {message && !error && (
                    <div
                        style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            background: "var(--pastel-green-bg)",
                            border: "1px solid var(--pastel-green-border)",
                            color: "var(--pastel-green-text)",
                            fontSize: "0.82rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "18px",
                        }}
                    >
                        <IconCheck size={15} />
                        <span>{message}</span>
                    </div>
                )}

                {/* Form Content */}
                <form
                    onSubmit={handleLogin}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                    }}
                >
                    <div>
                        <label
                            htmlFor="auth-email-input"
                            style={{
                                display: "block",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                color: "#334155",
                                marginBottom: "6px",
                            }}
                        >
                            Email Address
                        </label>
                        <div style={{ position: "relative" }}>
                            <input
                                id="auth-email-input"
                                type="email"
                                placeholder="name@company.com"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                required
                                autoFocus
                                style={{ paddingLeft: "38px" }}
                            />
                            <span
                                style={{
                                    position: "absolute",
                                    left: "12px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "#94A3B8",
                                    display: "flex",
                                }}
                            >
                                <IconMail size={16} />
                            </span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading || !email.trim()}
                        style={{
                            width: "100%",
                            justifyContent: "center",
                            padding: "12px 18px",
                            marginTop: "6px",
                        }}
                    >
                        {loading ? (
                            <>
                                <InlineSpinner size={15} />
                                <span>Signing in...</span>
                            </>
                        ) : (
                            <>
                                <span>Continue with Email</span>
                                <IconArrowRight size={15} />
                            </>
                        )}
                    </button>
                </form>

                {/* Security Note Footer */}
                <div
                    style={{
                        marginTop: "24px",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        fontSize: "0.75rem",
                        color: "#94A3B8",
                    }}
                >
                    <IconShieldCheck size={14} color="#10B981" />
                    <span>Passwordless authentication</span>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
