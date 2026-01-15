import type { FC } from "react";

import { Page } from "@/components/Page.tsx";
import { QrScanner } from "@/components/QrScanner";

export const IndexPage: FC = () => {
  return (
    <Page>
      <QrScanner />
    </Page>
  );
};
