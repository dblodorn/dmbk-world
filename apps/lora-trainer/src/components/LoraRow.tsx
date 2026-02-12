import { useState } from "react";
import { View, Text, Button, Image, Link } from "reshaped";

interface LoraRowProps {
  triggerWord: string;
  loraWeightsUrl: string | null;
  walletAddress: string;
  imageUrls: string[];
  steps: number;
  createdAt: string;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function LoraRow({
  triggerWord,
  loraWeightsUrl,
  walletAddress,
  imageUrls,
  steps,
  createdAt,
}: LoraRowProps) {
  const [copied, setCopied] = useState(false);
  const maxThumbnails = 4;
  const visibleImages = imageUrls.slice(0, maxThumbnails);
  const overflow = imageUrls.length - maxThumbnails;

  const handleCopy = () => {
    if (!loraWeightsUrl) return;
    navigator.clipboard.writeText(loraWeightsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View
      direction="row"
      align="center"
      gap={4}
      padding={4}
      borderRadius="medium"
      borderColor="neutral-faded"
    >
      {/* Thumbnails */}
      <View direction="row" gap={1} align="center">
        {visibleImages.map((url, i) => (
          <Image
            key={i}
            src={url}
            alt=""
            width="48px"
            height="48px"
            displayMode="cover"
            borderRadius="small"
          />
        ))}
        {overflow > 0 && (
          <Text variant="caption-1" color="neutral-faded">
            +{overflow}
          </Text>
        )}
      </View>

      {/* Details */}
      <View.Item grow>
        <Text variant="body-1" weight="bold">
          {triggerWord}
        </Text>
        <View direction="row" gap={3}>
          <Text variant="caption-1" color="neutral-faded">
            {steps} steps
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            {imageUrls.length} images
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            {formatDate(createdAt)}
          </Text>
        </View>
      </View.Item>

      {/* Wallet */}
      <Link
        href={`https://basescan.org/address/${walletAddress}`}
        attributes={{ target: "_blank", rel: "noopener noreferrer" }}
      >
        <Text
          variant="caption-1"
          color="neutral-faded"
          attributes={{ style: { fontFamily: "monospace" } }}
        >
          {truncateAddress(walletAddress)}
        </Text>
      </Link>

      {/* Actions */}
      {loraWeightsUrl && (
        <View direction="row" gap={2}>
          <Button variant="ghost" size="small" onClick={handleCopy}>
            {copied ? "Copied" : "Copy URL"}
          </Button>
          <Link
            href={loraWeightsUrl}
            attributes={{ target: "_blank", rel: "noopener noreferrer" }}
          >
            <Button variant="ghost" size="small">
              Download
            </Button>
          </Link>
        </View>
      )}
    </View>
  );
}
