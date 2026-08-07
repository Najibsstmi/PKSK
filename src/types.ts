export type CandidateProfile = {
  name: string;
  school: string;
  state: string;
  className: string;
};

export type PracticeMode = {
  id: "full" | "section" | "quick";
  title: string;
  subtitle: string;
  duration: string;
  focus: string;
  status: "Sedia" | "Fasa 1";
  accent: "ocean" | "coral" | "leaf";
};

export type PkskSection = {
  title: string;
  label: string;
  description: string;
  examples: string[];
};
