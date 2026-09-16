import { useState } from "react";
import { UniformsFeature as UniformsFeatureCore } from "./UniformsFeatureCore";
import { UniformDeliveryCancellation } from "./UniformDeliveryCancellation";

type UniformsFeatureProps = { actorName: string };

export function UniformsFeature({ actorName }: UniformsFeatureProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <UniformDeliveryCancellation actorName={actorName} onCancelled={() => setRefreshKey((value) => value + 1)} />
      <UniformsFeatureCore key={refreshKey} actorName={actorName} />
    </>
  );
}
