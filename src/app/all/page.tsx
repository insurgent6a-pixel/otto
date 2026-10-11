import { Suspense } from "react";
import { AllView } from "@/components/AllView";

export default function AllPage() {
  return (
    <Suspense>
      <AllView />
    </Suspense>
  );
}
