// Korean team name -> Naver Sports team code
export const TEAM_CODES: Record<string, string> = {
  LG: "LG",
  한화: "HH",
  롯데: "LT",
  KIA: "HT",
  SSG: "SK",
  삼성: "SS",
  KT: "KT",
  NC: "NC",
  두산: "OB",
  키움: "WO",
};

// Reverse lookup: Naver code -> Korean name
export const CODE_TO_TEAM: Record<string, string> = Object.fromEntries(Object.entries(TEAM_CODES).map(([name, code]) => [code, name]));

export const TEAM_NAMES = Object.keys(TEAM_CODES);

// Full club names for tooltips / headings.
export const TEAM_FULL_NAMES: Record<string, string> = {
  LG: "LG 트윈스",
  한화: "한화 이글스",
  롯데: "롯데 자이언츠",
  KIA: "KIA 타이거즈",
  SSG: "SSG 랜더스",
  삼성: "삼성 라이온즈",
  KT: "KT 위즈",
  NC: "NC 다이노스",
  두산: "두산 베어스",
  키움: "키움 히어로즈",
};

// Chart line colors, tuned for contrast on the dark background.
export const TEAM_COLORS: Record<string, string> = {
  LG: "#C30452",
  한화: "#FC4E00",
  KT: "#DDE2E8",
  롯데: "#094DAD",
  KIA: "#EA0029",
  SSG: "#FFB81C",
  삼성: "#1176F2",
  NC: "#AF917B",
  두산: "#534DB0",
  키움: "#B0764A",
};

export function getTeamShortName(team: string, season?: number | string): string {
  const year = season ? Number(String(season).slice(0, 4)) : undefined;
  if (team === "SSG" && year && year <= 2020) {
    return "SK";
  }
  if (team === "키움" && year && year <= 2018) {
    return "넥센";
  }
  return team;
}

export function getTeamFullName(team: string, season?: number | string): string {
  const year = season ? Number(String(season).slice(0, 4)) : undefined;
  if (team === "SSG") {
    if (year && year <= 2020) {
      return "SK 와이번스";
    }
    return "SSG 랜더스";
  }
  if (team === "키움") {
    if (year && year <= 2018) {
      return "넥센 히어로즈";
    }
    return "키움 히어로즈";
  }
  return TEAM_FULL_NAMES[team] ?? team;
}
