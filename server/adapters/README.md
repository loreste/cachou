# Database adapters

| Adapter | Status | Notes |
|---------|--------|-------|
| `sqlite` | **Supported** | Default. Uses Node built-in `node:sqlite`. |
| `memory` | **Supported** | In-process demo store. |
| `postgres` | Stub | Requires `CACHOU_DB_EXPERIMENTAL=1`; throws until you replace with a real driver. |
| `mysql` | Stub | Same. |
| `mongodb` | Stub | Same. |
| `firebase` | Stub | Same. |

**Recommendation:** use `createResource` against **your own API**. Demo adapters are not a production data layer.

To experiment with stubs:

```bash
CACHOU_DB_EXPERIMENTAL=1 CACHOU_DB_TYPE=postgres npm run dev
```
