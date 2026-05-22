function asString(value) {
    return String(value ?? "").trim();
}
export class DeviceWorker {
    name = "device_worker";
    async execute(input, context) {
        await context.log(`DeviceWorker executing ${context.action}`);
        const deviceId = asString(input.deviceId);
        if (context.action === "device.status.read") {
            if (!deviceId)
                return { ok: false, error: "device.status.read requires input.deviceId" };
            return { ok: true, output: { provider: "device", action: context.action, status: "status_prepared", deviceId } };
        }
        if (context.action === "device.command.prepare") {
            const command = asString(input.command);
            if (!deviceId || !command)
                return { ok: false, error: "device.command.prepare requires input.deviceId and input.command" };
            return { ok: true, output: { provider: "device", action: context.action, status: "command_prepared", deviceId, command, approvalRequired: true } };
        }
        if (context.action === "iot.sensor.read") {
            const sensorId = asString(input.sensorId || input.deviceId);
            if (!sensorId)
                return { ok: false, error: "iot.sensor.read requires input.sensorId" };
            return { ok: true, output: { provider: "iot", action: context.action, status: "sensor_read_prepared", sensorId, readings: [] } };
        }
        if (context.action === "robot.task.prepare") {
            const task = asString(input.task || input.title);
            if (!task)
                return { ok: false, error: "robot.task.prepare requires input.task" };
            return { ok: true, output: { provider: "robot", action: context.action, status: "robot_task_prepared", task, approvalRequired: true } };
        }
        return { ok: false, error: `Unsupported device action: ${context.action}` };
    }
}
