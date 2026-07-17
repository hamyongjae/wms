package com.example.wms.container.dto;

import com.example.wms.container.entity.ContainerStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ContainerStatusUpdateRequest {

    @NotNull(message = "변경할 상태는 필수입니다")
    private ContainerStatus status;
}
