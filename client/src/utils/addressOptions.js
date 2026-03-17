export const STATIC_ADDRESS_OPTIONS = ["SJT", "TT", "SMV", "Main Building", "MGR"];

export function buildAddressConfig(user, manualHostelBlock = "", manualHostelRoomNo = "") {
  const normalizedRole = String(user?.role || "").toLowerCase();
  const isPatientUser = ["student", "patient"].includes(normalizedRole);

  const userBlock = String(user?.block || localStorage.getItem("block") || "")
    .trim()
    .toUpperCase();
  const userRoomNo = String(user?.roomNo || localStorage.getItem("roomNo") || "").trim();

  const effectiveBlock = userBlock || String(manualHostelBlock || "").trim().toUpperCase();
  const effectiveRoomNo = userRoomNo || String(manualHostelRoomNo || "").trim();
  const hasHostelAddress = Boolean(effectiveBlock && effectiveRoomNo);

  const hostelAddressLabel = hasHostelAddress
    ? `Hostel Room - ${effectiveBlock} ${effectiveRoomNo}`
    : "Hostel Room - Enter Block and Room No";

  const options = [...STATIC_ADDRESS_OPTIONS];
  if (isPatientUser) {
    options.unshift(hostelAddressLabel);
  }

  return {
    options,
    hostelAddressLabel,
    hasHostelAddress,
    isPatientUser,
    showManualHostelEntry: isPatientUser && !hasHostelAddress,
  };
}
