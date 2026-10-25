export default function handler(_req, res) {
  res.status(200).json({
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', providerName: 'OVHcloud AI', available: true },
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', providerName: 'OVHcloud AI', available: true },
      { id: 'qwen-3.5-397b', label: 'Qwen 3.5 397B', providerName: 'OVHcloud AI', available: true },
      { id: 'qwen-3.8-27b', label: 'Qwen 3.8 27B', providerName: 'OVHcloud AI', available: true },
      { id: 'mistral-small-3.2', label: 'Mistral Small 3.2', providerName: 'OVHcloud AI', available: true },
      { id: 'gpt-oss-20b-fast', label: 'GPT-OSS 20B Fast', providerName: 'Pollinations', available: true },
      { id: 'mistral-nemo', label: 'Mistral Nemo 12B', providerName: 'OVHcloud AI', available: true },
    ],
  });
}
