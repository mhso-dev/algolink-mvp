import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Building2,
  Receipt,
  CalendarDays,
  FileText,
  Bell,
  Settings,
} from "lucide-react";
import type { AppRole } from "@/lib/role";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

const operatorNav: NavSection[] = [
  {
    title: "메인",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, description: "오늘 처리할 업무 한눈에" },
      { href: "/notifications", label: "알림", icon: Bell, description: "이슈/요청/일정 알림" },
    ],
  },
  {
    title: "교육사업",
    items: [
      { href: "/projects", label: "교육 프로젝트", icon: ClipboardList, description: "의뢰부터 정산까지" },
      { href: "/instructors", label: "강사 관리", icon: Users, description: "강사진 조회/등록" },
      { href: "/clients", label: "고객사 관리", icon: Building2, description: "고객사 등록/조회" },
    ],
  },
  {
    title: "정산",
    items: [
      { href: "/settlements", label: "정산 관리", icon: Receipt, description: "정산 흐름·매입매출" },
    ],
  },
];

const instructorNav: NavSection[] = [
  {
    title: "메인",
    items: [
      { href: "/me", label: "내 대시보드", icon: LayoutDashboard, description: "일정·정산 요약" },
      { href: "/notifications", label: "알림", icon: Bell, description: "배정 요청·정산" },
    ],
  },
  {
    title: "내 정보",
    items: [
      { href: "/me/resume", label: "이력서", icon: FileText, description: "양식 입력·PDF 다운로드" },
      { href: "/me/schedule", label: "일정", icon: CalendarDays, description: "강의·개인 일정" },
      { href: "/me/settlements", label: "내 정산", icon: Receipt, description: "지급 내역·세금 처리" },
      { href: "/me/settings", label: "설정", icon: Settings, description: "지급 정보·암호화 저장" },
    ],
  },
];

const adminExtras: NavSection = {
  title: "시스템",
  items: [
    { href: "/admin/users", label: "회원/권한", icon: Settings, description: "권한 변경·비활성화" },
  ],
};

export function getNavSections(role: AppRole): NavSection[] {
  if (role === "admin") return [...operatorNav, adminExtras];
  if (role === "operator") return operatorNav;
  if (role === "instructor") return instructorNav;
  return [];
}

export function getDefaultLandingPath(role: AppRole): string {
  if (role === "instructor") return "/me";
  if (role === "operator" || role === "admin") return "/dashboard";
  return "/login";
}
