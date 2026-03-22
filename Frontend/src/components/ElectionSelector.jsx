export default function ElectionSelector({ elections, selectedElectionId, onSelectElection }) {
  return (
    <select
      className="field-input"
      value={selectedElectionId ?? ""}
      onChange={(event) => onSelectElection(event.target.value)}
    >
      {elections.map((election) => (
        <option key={election.id} value={election.id}>
          {election.title}
        </option>
      ))}
    </select>
  );
}
