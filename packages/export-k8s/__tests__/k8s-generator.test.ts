import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { generateK8sManifestsFromAdacFile } from '../src/index.js';

const TEMP_DIR_PREFIX = join(tmpdir(), 'adac-export-k8s-');
const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(TEMP_DIR_PREFIX);
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

function hasKubectl(): boolean {
  try {
    execFileSync('kubectl', ['version', '--client'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateFromYaml(content: string) {
  const tempDir = createTempDir();
  const filePath = join(tempDir, 'k8s.adac.yaml');
  writeFileSync(filePath, content);

  return generateK8sManifestsFromAdacFile(filePath, { validate: false });
}

const adacYaml = `
version: '0.1'
metadata:
  name: 'Kubernetes Test'
  created: '2026-01-05'
infrastructure:
  clouds:
    - id: 'k8s-cluster'
      provider: 'kubernetes'
      region: 'prod'
      services:
        - id: 'app-config'
          subtype: 'kubernetes-configmap'
          config:
            namespace: 'web'
            data:
              API_BASE_URL: 'https://api.example.local'
        - id: 'app-secret'
          subtype: 'kubernetes-secret'
          config:
            namespace: 'web'
            data:
              DATABASE_URL: 'postgres://db:5432/app'
        - id: 'frontend-deployment'
          type: 'compute'
          subtype: 'kubernetes-deployment'
          tags:
            tier: 'frontend'
          config:
            namespace: 'web'
            replicas: 3
            container:
              name: 'frontend'
              image: 'example/frontend:1.0.0'
              port: 3000
              config_map_ref: 'app-config'
              secret_ref: 'app-secret'
              resources:
                requests:
                  cpu: '100m'
                  memory: '128Mi'
                limits:
                  cpu: '500m'
                  memory: '256Mi'
              env:
                API_BASE_URL: 'https://api.example.local'
              liveness_probe:
                http_get:
                  path: '/health'
                  port: 3000
                initial_delay_seconds: 30
        - id: 'frontend-service'
          type: 'network'
          subtype: 'kubernetes-service'
          config:
            namespace: 'web'
            service_type: 'ClusterIP'
            selector: 'frontend-deployment'
            port: 80
            target_port: 3000
        - id: 'web-ingress'
          type: 'network'
          subtype: 'kubernetes-ingress'
          config:
            namespace: 'web'
            ingress_class: 'nginx'
            rules:
              - host: 'example.local'
                paths:
                  - path: '/'
                    service: 'frontend-service'
                    port: 80
`;

describe('generateK8sManifestsFromAdacFile', () => {
  it('generates valid multi-document Kubernetes YAML', () => {
    const result = generateFromYaml(adacYaml);
    const parsed = yaml.loadAll(result.yaml);

    expect(result.yaml).toContain('apiVersion: apps/v1');
    expect(result.yaml).toContain('kind: Deployment');
    expect(result.yaml).toContain('kind: Service');
    expect(result.yaml).toContain('kind: Ingress');
    expect(result.yaml).toContain('kind: ConfigMap');
    expect(result.yaml).toContain('kind: Secret');
    expect(parsed).toHaveLength(result.manifests.length);
    expect(result.diagnostics).toContain('Processed 5 services');
  });

  it('generates correct Deployment, Service, Ingress, ConfigMap, Secret, and Namespace manifests', () => {
    const result = generateFromYaml(adacYaml);
    const deployment = result.manifests.find(
      (manifest) => manifest.kind === 'Deployment'
    );
    const service = result.manifests.find(
      (manifest) => manifest.kind === 'Service'
    );
    const ingress = result.manifests.find(
      (manifest) => manifest.kind === 'Ingress'
    );
    const configMap = result.manifests.find(
      (manifest) => manifest.kind === 'ConfigMap'
    );
    const secret = result.manifests.find(
      (manifest) => manifest.kind === 'Secret'
    );
    const namespace = result.manifests.find(
      (manifest) => manifest.kind === 'Namespace'
    );

    expect(namespace?.metadata.name).toBe('web');
    expect(configMap?.metadata.namespace).toBe('web');
    expect(configMap?.data).toEqual({
      API_BASE_URL: 'https://api.example.local',
    });
    expect(secret?.stringData).toEqual({
      DATABASE_URL: 'postgres://db:5432/app',
    });
    expect(deployment?.metadata.name).toBe('frontend-deployment');
    expect(deployment?.spec).toMatchObject({
      replicas: 3,
      selector: {
        matchLabels: { 'app.kubernetes.io/name': 'frontend-deployment' },
      },
    });
    expect(service?.spec).toMatchObject({
      type: 'ClusterIP',
      selector: { 'app.kubernetes.io/name': 'frontend-deployment' },
      ports: [{ port: 80, targetPort: 3000, protocol: 'TCP' }],
    });
    expect(ingress?.spec).toMatchObject({
      ingressClassName: 'nginx',
      rules: [
        {
          host: 'example.local',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'frontend-service',
                    port: { number: 80 },
                  },
                },
              },
            ],
          },
        },
      ],
    });
  });

  it('passes kubectl apply --dry-run when kubectl is available', () => {
    if (!hasKubectl()) {
      return;
    }

    const result = generateFromYaml(adacYaml);
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, 'manifests.yaml');
    writeFileSync(manifestPath, result.yaml);

    expect(() =>
      execFileSync(
        'kubectl',
        ['apply', '--dry-run=client', '--validate=false', '-f', manifestPath],
        { stdio: 'pipe' }
      )
    ).not.toThrow();
  });
});
