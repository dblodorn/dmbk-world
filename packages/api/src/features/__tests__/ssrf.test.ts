import { describe, it, expect, vi } from "vitest";
import dns from "node:dns";
import {
  isPrivateIP,
  validateImageUrl,
  ALLOWED_IMAGE_DOMAINS,
} from "../fal";

describe("ALLOWED_IMAGE_DOMAINS", () => {
  it("includes the are.na CloudFront CDN", () => {
    expect(ALLOWED_IMAGE_DOMAINS).toContain("d2w9rnfcy7mm78.cloudfront.net");
  });

  it("includes are.na subdomain pattern", () => {
    expect(ALLOWED_IMAGE_DOMAINS).toContain(".are.na");
  });
});

describe("isPrivateIP", () => {
  describe("IPv4 private ranges", () => {
    it.each([
      ["127.0.0.1", "loopback"],
      ["127.255.255.255", "loopback end"],
      ["10.0.0.1", "10.x private"],
      ["10.255.255.255", "10.x end"],
      ["172.16.0.1", "172.16.x private"],
      ["172.31.255.255", "172.31.x end"],
      ["192.168.0.1", "192.168.x private"],
      ["192.168.255.255", "192.168.x end"],
      ["169.254.169.254", "cloud metadata"],
      ["169.254.0.1", "link-local"],
      ["0.0.0.0", "unspecified"],
      ["100.64.0.1", "carrier-grade NAT"],
      ["100.127.255.255", "carrier-grade NAT end"],
      ["198.18.0.1", "benchmark"],
      ["198.19.255.255", "benchmark end"],
    ])("rejects %s (%s)", (ip) => {
      expect(isPrivateIP(ip)).toBe(true);
    });
  });

  describe("IPv4 public addresses", () => {
    it.each([
      ["8.8.8.8", "Google DNS"],
      ["151.101.1.140", "Fastly CDN"],
      ["1.1.1.1", "Cloudflare DNS"],
      ["52.84.123.45", "AWS CloudFront range"],
      ["172.15.255.255", "just below 172.16"],
      ["172.32.0.0", "just above 172.31"],
      ["100.63.255.255", "just below carrier-grade NAT"],
      ["100.128.0.0", "just above carrier-grade NAT"],
    ])("allows %s (%s)", (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    });
  });

  describe("IPv6", () => {
    it.each([
      ["::1", "loopback"],
      ["::", "unspecified"],
      ["fe80::1", "link-local"],
      ["fc00::1", "unique local fc"],
      ["fd00::1", "unique local fd"],
      ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
      ["::ffff:10.0.0.1", "IPv4-mapped 10.x"],
      ["::ffff:192.168.1.1", "IPv4-mapped 192.168.x"],
      ["::ffff:169.254.1.1", "IPv4-mapped link-local"],
    ])("rejects %s (%s)", (ip) => {
      expect(isPrivateIP(ip)).toBe(true);
    });
  });

  it("rejects unrecognized IP formats (fail-closed)", () => {
    expect(isPrivateIP("not-an-ip")).toBe(true);
    expect(isPrivateIP("")).toBe(true);
  });
});

describe("validateImageUrl", () => {
  // Mock DNS to return a public IP for allowed domains
  vi.spyOn(dns.promises, "lookup").mockResolvedValue({
    address: "52.84.123.45",
    family: 4,
  });

  describe("scheme enforcement", () => {
    it("rejects http:// URLs", async () => {
      await expect(
        validateImageUrl("http://d2w9rnfcy7mm78.cloudfront.net/image.jpg"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("rejects ftp:// URLs", async () => {
      await expect(
        validateImageUrl("ftp://d2w9rnfcy7mm78.cloudfront.net/image.jpg"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("rejects file:// URLs", async () => {
      await expect(
        validateImageUrl("file:///etc/passwd"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("rejects data: URLs", async () => {
      await expect(
        validateImageUrl("data:text/html,<script>alert(1)</script>"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });
  });

  describe("credential rejection", () => {
    it("rejects URLs with username", async () => {
      await expect(
        validateImageUrl("https://user@d2w9rnfcy7mm78.cloudfront.net/img.jpg"),
      ).rejects.toThrow("URLs with credentials are not allowed");
    });

    it("rejects URLs with username and password", async () => {
      await expect(
        validateImageUrl(
          "https://user:pass@d2w9rnfcy7mm78.cloudfront.net/img.jpg",
        ),
      ).rejects.toThrow("URLs with credentials are not allowed");
    });
  });

  describe("domain allowlist", () => {
    it("allows d2w9rnfcy7mm78.cloudfront.net", async () => {
      await expect(
        validateImageUrl(
          "https://d2w9rnfcy7mm78.cloudfront.net/123/original_abc.jpg",
        ),
      ).resolves.toBeUndefined();
    });

    it("allows are.na bare domain", async () => {
      await expect(
        validateImageUrl("https://are.na/some/path.jpg"),
      ).resolves.toBeUndefined();
    });

    it("allows images.are.na subdomain", async () => {
      await expect(
        validateImageUrl("https://images.are.na/some/path.jpg"),
      ).resolves.toBeUndefined();
    });

    it("allows www.are.na subdomain", async () => {
      await expect(
        validateImageUrl("https://www.are.na/some/path.jpg"),
      ).resolves.toBeUndefined();
    });

    it("rejects non-allowlisted domains", async () => {
      await expect(
        validateImageUrl("https://evil.com/image.jpg"),
      ).rejects.toThrow('Domain "evil.com" is not in the allowed list');
    });

    it("rejects lookalike domains (notare.na)", async () => {
      await expect(
        validateImageUrl("https://notare.na/image.jpg"),
      ).rejects.toThrow(
        'Domain "notare.na" is not in the allowed list',
      );
    });

    it("rejects localhost", async () => {
      await expect(
        validateImageUrl("https://localhost/image.jpg"),
      ).rejects.toThrow(
        'Domain "localhost" is not in the allowed list',
      );
    });

    it("rejects cloud metadata IP as hostname", async () => {
      await expect(
        validateImageUrl("https://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow("is not in the allowed list");
    });
  });

  describe("DNS resolution — private IP rejection", () => {
    it("rejects when hostname resolves to a private IP", async () => {
      vi.spyOn(dns.promises, "lookup").mockResolvedValueOnce({
        address: "127.0.0.1",
        family: 4,
      });

      await expect(
        validateImageUrl(
          "https://d2w9rnfcy7mm78.cloudfront.net/image.jpg",
        ),
      ).rejects.toThrow("resolves to a private IP address");
    });

    it("rejects when hostname resolves to cloud metadata IP", async () => {
      vi.spyOn(dns.promises, "lookup").mockResolvedValueOnce({
        address: "169.254.169.254",
        family: 4,
      });

      await expect(
        validateImageUrl(
          "https://d2w9rnfcy7mm78.cloudfront.net/image.jpg",
        ),
      ).rejects.toThrow("resolves to a private IP address");
    });

    it("rejects when DNS lookup fails", async () => {
      vi.spyOn(dns.promises, "lookup").mockRejectedValueOnce(
        new Error("ENOTFOUND"),
      );

      await expect(
        validateImageUrl(
          "https://d2w9rnfcy7mm78.cloudfront.net/image.jpg",
        ),
      ).rejects.toThrow("Failed to resolve hostname");
    });

    it("allows when hostname resolves to a public IP", async () => {
      vi.spyOn(dns.promises, "lookup").mockResolvedValueOnce({
        address: "52.84.123.45",
        family: 4,
      });

      await expect(
        validateImageUrl(
          "https://d2w9rnfcy7mm78.cloudfront.net/image.jpg",
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("invalid URLs", () => {
    it("rejects completely invalid URLs", async () => {
      await expect(validateImageUrl("not-a-url")).rejects.toThrow(
        "Invalid URL",
      );
    });

    it("rejects empty string", async () => {
      await expect(validateImageUrl("")).rejects.toThrow("Invalid URL");
    });
  });
});
