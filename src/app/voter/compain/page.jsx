"use client";

import { useApp } from "@/src/components/AppProvider";
import VoterCampaignView from "@/src/components/VoterCampaignView";

export default function VoterCampaignPage() {
  const { user, elections, selectedElectionId, setSelectedElectionId } = useApp();
  return (
    <VoterCampaignView
      user={user}
      elections={elections}
      selectedElectionId={selectedElectionId}
      onSelectElection={setSelectedElectionId}
    />
  );
}
