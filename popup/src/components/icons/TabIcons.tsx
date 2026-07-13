interface TabIconProps {
  className?: string;
}

const iconClass = "block shrink-0 w-[20px] h-[20px]";

/** Auction hammer — market scanning & auto-buy */
export function MarketTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 27 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M14.4782 3.27178L6.96875 10.7812L11.2892 15.1017L18.7986 7.5922L14.4782 3.27178Z" fill="currentColor" />
      <path d="M6.3 17.3706C7.65 18.7206 9.83 18.7206 11.18 17.3706L4.7 10.8906C3.35 12.2406 3.35 14.4206 4.7 15.7706L6.3 17.3706Z" fill="currentColor" />
      <path d="M21.0581 2.60859L19.4581 1.00859C18.1081 -0.341406 15.9281 -0.341406 14.5781 1.00859L21.0581 7.48859C22.4081 6.13859 22.4081 3.95859 21.0581 2.60859Z" fill="currentColor" />
      <path d="M26.0984 19.9592L17.3384 11.1992L14.8984 13.6392L23.6584 22.3992C24.3284 23.0692 25.4284 23.0692 26.0984 22.3992C26.7684 21.7292 26.7684 20.6292 26.0984 19.9592Z" fill="currentColor" />
      <path d="M10.66 24.8189C10.22 23.4089 8.93 22.3789 7.38 22.3789H5.12C3.57 22.3789 2.27 23.4089 1.84 24.8189C0.75 25.3989 0 26.5289 0 27.8489H12.5C12.5 26.5289 11.75 25.3989 10.66 24.8189Z" fill="currentColor" />
    </svg>
  );
}

/** Rounded RPG loot bag — selling & pricing rules */
export function LootTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M8.5 7V5.2C8.5 3.43 10.07 2 12 2s3.5 1.43 3.5 3.2V7h1.2C18.54 7 20 8.46 20 10.3v7.4c0 2.54-2.24 4.3-5 4.3H9c-2.76 0-5-1.76-5-4.3v-7.4C4 8.46 5.46 7 7.3 7h1.2zm2-1.8V7h3V5.2c0-.66-.67-1.2-1.5-1.2s-1.5.54-1.5 1.2zM12 14.75c1.1 0 2-.9 2-2h1.5c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5H10c0 1.1.9 2 2 2z" />
    </svg>
  );
}

/** Crossed swords — battle presets & combat setup (MDI sword-cross, Apache-2.0) */
export function BattleTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="m6.2 2.44 11.9 11.9 2.12-2.12 1.41 1.41-2.47 2.47 3.18 3.18c.39.39.39 1.02 0 1.41l-.71.71a.996.996 0 0 1-1.41 0L17 18.23l-2.44 2.47-1.41-1.41 2.12-2.12-11.9-11.9V2.44zM15.89 10l4.74-4.74V2.44H17.8l-4.74 4.74zm-4.95 5-2.83-2.87-2.21 2.21-2.12-2.12-1.41 1.41 2.47 2.47-3.18 3.19a.996.996 0 0 0 0 1.41l.71.71c.39.39 1.02.39 1.41 0L7 18.23l2.44 2.47 1.41-1.41-2.12-2.12z" />
    </svg>
  );
}

/** Crosshair — auto hunt targeting & lure lock */
export function HuntTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
    </svg>
  );
}

/** Checklist — monster task quests & auto tasker */
export function TasksTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m-2 14-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z" />
    </svg>
  );
}

/** Wrench & screwdriver — utility tools (MDI tools, Apache-2.0) */
export function ToolsTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M21.71 20.29 20.29 21.71a1 1 0 0 1-1.41 0L7 9.85A3.81 3.81 0 0 1 6 10a4 4 0 0 1-3.78-5.3L4.76 7.24 5.29 6.71 6.71 5.29 7.24 4.76 4.7 2.22A4 4 0 0 1 10 6a3.81 3.81 0 0 1-.15 1L21.71 18.88a1 1 0 0 1 0 1.41M2.29 18.88a1 1 0 0 0 0 1.41L3.71 21.71a1 1 0 0 0 1.41 0l5.47-5.46-2.83-2.83M20 2l-4 2v2l-2.17 2.17 2 2L18 8h2l2-4z" />
    </svg>
  );
}

/** Bug / diagnostics — dev-only traffic inspector */
export function DebugTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M20 8h-2.81a5.985 5.985 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17A5.994 5.994 0 0 0 12 5c-.7 0-1.37.12-2 .34L7.83 3 6.41 4.41l1.62 1.63C7.25 6.77 6.63 7.39 6.19 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
    </svg>
  );
}

/** Gear — extension settings */
export function SettingsTabIcon({ className = iconClass }: TabIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}
