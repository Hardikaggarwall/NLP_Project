import { UserProfile } from "@/services/user.service";
import React from "react";
import { Link, NavLink } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import {
    IconClose,
    IconDocument,
    IconFolder,
    IconHome,
} from "./icons/CustomIcons";

export type DashboardTab = "agreements" | "files";

interface SidebarProps {
    user?: UserProfile | null;
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    user,
    isMobileOpen = false,
    onCloseMobile,
}) => {
    const sidebarContent = (
        <aside
            style={{
                width: "260px",
                background: "#FAFAFC",
                borderRight: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: "100vh",
                position: "sticky",
                top: 0,
                padding: "24px 18px",
                zIndex: 50,
            }}
        >
            <div>
                {/* Logo & Mobile Close Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "32px",
                        padding: "0 6px",
                    }}
                >
                    <Link
                        to="/"
                        onClick={onCloseMobile}
                        style={{
                            textDecoration: "none",
                        }}
                    >
                        <BrandLogo size="md" />
                    </Link>

                    {onCloseMobile && (
                        <button
                            onClick={onCloseMobile}
                            className="btn btn-ghost btn-sm mobile-show-flex"
                            style={{ display: "none", padding: "6px" }}
                            aria-label="Close sidebar"
                        >
                            <IconClose size={16} />
                        </button>
                    )}
                </div>

                {/* Section Label */}
                <div
                    style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "0 10px 12px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <span>Workspace</span>
                </div>

                {/* Navigation Items */}
                <nav
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                    }}
                >
                    <NavLink
                        to="/dashboard/agreements"
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                            `btn ${isActive ? "btn-primary" : "btn-ghost"}`
                        }
                        style={{
                            justifyContent: "flex-start",
                            width: "100%",
                            fontSize: "0.875rem",
                            padding: "10px 14px",
                            textDecoration: "none",
                            borderRadius: "12px",
                        }}
                    >
                        <IconDocument size={16} />
                        <span>Agreements</span>
                    </NavLink>

                    <NavLink
                        to="/dashboard/files"
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                            `btn ${isActive ? "btn-primary" : "btn-ghost"}`
                        }
                        style={{
                            justifyContent: "flex-start",
                            width: "100%",
                            fontSize: "0.875rem",
                            padding: "10px 14px",
                            textDecoration: "none",
                            borderRadius: "12px",
                        }}
                    >
                        <IconFolder size={16} />
                        <span>Files History</span>
                    </NavLink>
                </nav>
            </div>

            {/* Footer Area: User Profile, Home & Settings */}
            <div
                style={{
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: "18px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "14px",
                    }}
                >
                    <Link
                        to="/"
                        onClick={onCloseMobile}
                        className="btn btn-ghost btn-sm"
                        title="Go to Homepage"
                        style={{
                            fontSize: "0.8rem",
                            textDecoration: "none",
                            padding: "6px 10px",
                        }}
                    >
                        <IconHome size={15} /> Homepage
                    </Link>
                </div>

                {/* Shared public account */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                        padding: "10px 12px",
                        background: "#FFFFFF",
                        borderRadius: "12px",
                        border: "1px solid var(--border-medium)",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                    }}
                >
                    <div
                        style={{
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                color: "#0F172A",
                            }}
                        >
                            {user?.name || "Guest"}
                        </div>
                        <div
                            style={{
                                fontSize: "0.72rem",
                                color: "#64748B",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {user?.email || "Shared public workspace"}
                    </div>
                </div>
            </div>
            </div>
        </aside>
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="mobile-hide">{sidebarContent}</div>

            {/* Mobile Drawer */}
            {isMobileOpen && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "var(--bg-modal-overlay)",
                        backdropFilter: "blur(4px)",
                        zIndex: 90,
                        display: "flex",
                    }}
                    onClick={onCloseMobile}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "280px",
                            height: "100%",
                            animation: "fadeInModal 0.2s ease-out",
                        }}
                    >
                        {sidebarContent}
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;
