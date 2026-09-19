/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
    // pdfkit loads its standard fonts via files under js/data/*.afm.
    // Next's file tracer usually finds these automatically, but this
    // makes it explicit so a future pdfkit upgrade can't silently
    // drop them from the serverless bundle (this bit sos-caffe once).
    serverComponentsExternalPackages: ["pdfkit"],
          outputFileTracingIncludes: {
      "/api/orders/daily-report": ["./node_modules/pdfkit/js/data/**"],
        },
    },
};

export default nextConfig;
