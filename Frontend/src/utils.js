export function formatDateTime(value) {
  if (!value) {
    return "Not scheduled";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatCountdown(targetDate) {
  const difference = new Date(targetDate).getTime() - Date.now();
  if (difference <= 0) {
    return "00d 00h 00m 00s";
  }

  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export function getScopeLabel(position) {
  if (position.section?.name) {
    return position.section.name;
  }
  if (position.department?.name) {
    return position.department.name;
  }
  return "Entire campus";
}

export function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function getStatusLabel(status) {
  if (!status) {
    return "Unknown";
  }
  return status[0].toUpperCase() + status.slice(1);
}
