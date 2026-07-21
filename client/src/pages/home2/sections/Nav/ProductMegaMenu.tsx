import { useMegaMenu } from "@/pages/home2/hooks/useMegaMenu";
import {
  MegaMenuTrigger,
  MegaMenuPanel,
  MegaMenuLabel,
  FeatureLink,
  MegaMenuLinkRow,
} from "./MegaMenuPrimitives";
import { productFeatures, productSolutions, productTools } from "./data";

const MENU_ID = "venturecite-product-menu";

export function ProductMegaMenu() {
  const { isOpen, containerProps, open } = useMegaMenu();

  return (
    <div className="relative" {...containerProps}>
      <MegaMenuTrigger label="Product" isOpen={isOpen} controlsId={MENU_ID} onClick={open} />
      <MegaMenuPanel isOpen={isOpen} id={MENU_ID} width="w-[600px]">
        <div className="grid grid-cols-[1fr_192px]">
          <div className="p-6 pr-5">
            <MegaMenuLabel isVisible={isOpen} delay={40}>
              Features
            </MegaMenuLabel>
            <div className="space-y-0.5">
              {productFeatures.map((item, index) => (
                <FeatureLink key={item.name} item={item} index={index} isVisible={isOpen} />
              ))}
            </div>
          </div>
          <div className="p-6 pl-5 border-l border-tk-default">
            <MegaMenuLabel isVisible={isOpen} delay={80}>
              Solutions
            </MegaMenuLabel>
            <div className="space-y-0 mb-5">
              {productSolutions.map((item, index) => (
                <MegaMenuLinkRow
                  key={item.name}
                  item={item}
                  index={index}
                  baseDelay={120}
                  isVisible={isOpen}
                />
              ))}
            </div>
            <MegaMenuLabel isVisible={isOpen} delay={160}>
              Tools
            </MegaMenuLabel>
            <div className="space-y-0">
              {productTools.map((item, index) => (
                <MegaMenuLinkRow
                  key={item.name}
                  item={item}
                  index={index}
                  baseDelay={200}
                  isVisible={isOpen}
                />
              ))}
            </div>
          </div>
        </div>
      </MegaMenuPanel>
    </div>
  );
}
