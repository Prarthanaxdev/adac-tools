# @mindfiredigital/adac-export-k8s

Generate Kubernetes manifests from ADAC architecture definitions.

## Features

- Deployment, Service, and Ingress manifest generation
- ConfigMap and Secret generation
- Namespace manifests for non-default namespaces
- Multi-document Kubernetes YAML output
- Raw manifest objects for testing or post-processing

## Usage

```ts
import { generateK8sManifestsFromAdacFile } from '@mindfiredigital/adac-export-k8s';

const result = generateK8sManifestsFromAdacFile('architecture.adac.yaml', {
  validate: false,
});

console.log(result.yaml);
```

## ADAC Example

```yaml
version: '0.1'
metadata:
  name: 'Kubernetes App'
  created: '2026-01-05'
infrastructure:
  clouds:
    - id: 'k8s'
      provider: 'kubernetes'
      region: 'prod-cluster'
      services:
        - id: 'api-deployment'
          type: 'compute'
          subtype: 'kubernetes-deployment'
          config:
            namespace: 'api'
            replicas: 2
            container:
              name: 'api'
              image: 'example/api:1.0.0'
              port: 8080

        - id: 'api-service'
          type: 'network'
          subtype: 'kubernetes-service'
          config:
            namespace: 'api'
            selector: 'api-deployment'
            port: 80
            target_port: 8080
```

## API

### `generateK8sManifestsFromAdacFile(filePath, options?)`

Parses an ADAC YAML file and returns Kubernetes manifests.

### `generateK8sManifestsFromAdacConfig(adacConfig, options?)`

Generates manifests from an already parsed ADAC config.

### `generateK8sManifests(services, options?)`

Generates manifests from a list of ADAC services.

## Options

- `cloudId`: select a specific cloud entry
- `namespace`: default namespace when a service does not define one
- `includeNamespaceManifests`: include Namespace documents for non-default namespaces
- `validate`: enable ADAC schema validation when parsing files
