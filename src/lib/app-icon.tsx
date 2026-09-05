// PWA/favicon 아이콘들이 공유하는 마크. lucide-react의 Wrench 아이콘 path(ISC 라이선스)를
// 그대로 사용해 앱 전반의 렌치 아이콘과 통일된 느낌을 준다.
const WRENCH_PATH =
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z";

export const APP_ICON_BACKGROUND = "#0f172a";

interface AppIconMarkProps {
  size: number;
  /** 0이면 꽉 채운 정사각형(애플 터치 아이콘/설치 아이콘용), 값이 있으면 둥근 모서리(파비콘용) */
  radius?: number;
}

export function AppIconMark({ size, radius = 0 }: AppIconMarkProps) {
  const iconSize = Math.round(size * 0.56);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: APP_ICON_BACKGROUND,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={WRENCH_PATH} />
      </svg>
    </div>
  );
}
