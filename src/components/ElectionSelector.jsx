export default function ElectionSelector({
  elections,
  selectedElectionId,
  onSelectElection,
  inputId = "election-select",
  inputName = "election",
}) {
  return (
    <select
      id={inputId}
      name={inputName}
      className="field-input"
      value={selectedElectionId ?? ""}
      onChange={(event) => onSelectElection(event.target.value)}
      disabled={!elections.length}
    >
      {!elections.length ? (
        <option value="">Loading elections...</option>
      ) : null}
      {elections.map((election) => (
        <option key={election.id} value={election.id}>
          {election.title}
        </option>
      ))}
    </select>
  );
}
