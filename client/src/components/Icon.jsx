const paths = {
  applications: "M8 5V3h8v2M4 7h16v13H4zM4 11h16M10 11v3h4v-3",
  alerts: "M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6M9 20h6",
  skills: "m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z",
  resume: "M7 3h7l4 4v14H6V3zM14 3v5h5M9 12h6M9 16h6",
  growth: "M4 19h16M6 15l4-5 4 2 5-8M15 4h4v4",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  plus: "M12 5v14M5 12h14",
  search: "M15 15l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  arrow: "M5 12h14M14 7l5 5-5 5",
  back: "M19 12H5M10 7l-5 5 5 5",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  logout: "M10 4H4v16h6M9 12h12M17 8l4 4-4 4",
  check: "m5 12 4 4L19 6",
  upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  board: "M3 4h5v16H3zM10 4h5v12h-5zM17 4h4v9h-4z",
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] ?? paths.applications} />
    </svg>
  );
}
